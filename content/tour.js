import { lessons } from "./lessons.js"

let activeSketchpad = null

function onIframeReady(iframe, fn) {
  if (iframe.contentDocument?.readyState === "complete" && iframe.contentWindow?.app) {
    fn()
  } else {
    iframe.addEventListener("load", fn, { once: true })
  }
}

// --- Embed helper: wraps an iframe + toolbar + message for lesson scripts ---

function createEmbed(container) {
  const iframe = container.querySelector("iframe")
  const message = container.querySelector("[data-message]")

  const toolbar = document.createElement("div")
  container.appendChild(toolbar)

  function getApp() {
    return iframe.contentWindow?.app
  }

  // Action dispatch
  let enabledActions = new Set()
  let actionHandlers = {}
  let keyMap = {}

  // Script state
  let scriptIterator = null
  let waitingFor = null

  const embed = {
    get keyMap() { return keyMap },

    showMessage(text) {
      message.textContent = text
      message.hidden = false
    },

    hideMessage() {
      message.hidden = true
    },

    setButtons(buttons, handlers = {}) {
      toolbar.innerHTML = ""
      enabledActions = new Set()
      actionHandlers = handlers
      keyMap = {}
      for (const b of buttons) {
        enabledActions.add(b.action)
        keyMap[b.key] = b.action
        const btn = document.createElement("button")
        btn.dataset.action = b.action
        btn.innerHTML = `${b.label}<kbd>${b.key}</kbd>`
        toolbar.appendChild(btn)
      }
    },

    waitForPenMovement(distance) {
      return new Promise((resolve) => {
        let traveled = 0
        let lastPos = null
        const check = () => {
          const app = getApp()
          const pos = app?.pen.pos
          if (pos) {
            if (lastPos) {
              const dx = pos.x - lastPos.x
              const dy = pos.y - lastPos.y
              traveled += Math.sqrt(dx * dx + dy * dy)
            }
            lastPos = { x: pos.x, y: pos.y }
          } else {
            lastPos = null
          }
          if (traveled >= distance) {
            resolve()
          } else {
            requestAnimationFrame(check)
          }
        }
        requestAnimationFrame(check)
      })
    },

    ping() {
      const app = getApp()
      if (!app) return
      const pos = app.pen.pos
      if (!pos) return

      // Lazy-init: create a master circle in drawing 9
      if (!embed._particleMaster) {
        const master = app.drawing("9")
        const r = 3
        master.addArc(
          { x: r, y: 0 },
          { x: r, y: 0 },
          { x: 0, y: 0 },
          "cw",
          false
        )
        embed._particleMaster = master
        embed._particles = []
      }

      // Spawn an instance at the pen position
      const angle = Math.random() * Math.PI * 2
      const speed = 0.3 + Math.random() * 0.5
      const instance = app.drawing().addInstance(
        embed._particleMaster,
        { x: pos.x, y: pos.y },
        1,
        0
      )
      embed._particles.push({
        instance,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        deathTime: performance.now() + 2000,
      })

      // Start particle animation loop if not running
      if (!embed._particleLoop) {
        embed._particleLoop = true
        let lastTime = performance.now()
        const tick = () => {
          const app = getApp()
          if (!app) return
          const now = performance.now()
          const dt = (now - lastTime) / (1000 / 60) // normalize to ~60fps
          lastTime = now
          for (const p of embed._particles) {
            p.instance.moveBy(p.vx * dt, p.vy * dt)
          }
          // Remove dead particles
          const dead = embed._particles.filter(p => now >= p.deathTime)
          for (const p of dead) {
            app.drawing().deleteThing(p.instance)
          }
          embed._particles = embed._particles.filter(p => now < p.deathTime)
          if (embed._particles.length > 0) {
            requestAnimationFrame(tick)
          } else {
            embed._particleLoop = false
          }
        }
        requestAnimationFrame(tick)
      }
    },

    doAction(action) {
      if (!enabledActions.has(action)) return
      const handler = actionHandlers[action]
      const app = getApp()
      if (handler && app) handler(app)
      advance(action)
    },

    getApp,
    toolbar,
  }

  // Script runner
  async function advanceScript(value) {
    if (!scriptIterator) return
    const { value: nextWait, done } = await scriptIterator.next(value)
    if (done) {
      scriptIterator = null
      waitingFor = null
    } else {
      waitingFor = nextWait
    }
  }

  function advance(action) {
    if (!scriptIterator || waitingFor === null) return
    const accepted = Array.isArray(waitingFor) ? waitingFor.includes(action) : waitingFor === action
    if (!accepted) return
    waitingFor = null
    advanceScript(action)
  }

  // Configure the embed once loaded
  onIframeReady(iframe, () => {
    iframe.contentWindow.config().showStatus = false
  })

  // Prevent iframe from stealing keyboard focus — all keyboard
  // dispatch is hover-based from the parent document
  iframe.tabIndex = -1
  iframe.style.pointerEvents = "none"

  // Pointer events fall through the iframe (pointer-events: none)
  // to the container — we forward the position to the iframe's app
  container.addEventListener("pointerenter", () => { activeSketchpad = embed })
  container.addEventListener("pointerleave", () => {
    if (activeSketchpad === embed) activeSketchpad = null
    getApp()?.pen.clearPos()
  })
  container.addEventListener("pointermove", (e) => {
    const app = getApp()
    if (!app) return
    const rect = iframe.getBoundingClientRect()
    app.pen.moveToScreenPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    app.pen.snapPos()
  })

  // Toolbar clicks
  toolbar.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest("button")
    if (!btn) return
    const action = btn.dataset.action
    embed.doAction(action)
  })

  // Start lesson
  const lessonName = container.dataset.lesson
  const lesson = lessons[lessonName]
  if (lesson?.script) {
    scriptIterator = lesson.script(embed)
    advanceScript()
  } else if (lesson?.buttons) {
    embed.setButtons(lesson.buttons, lesson.actions)
  }

  return embed
}

// --- Keyboard shortcuts ---

document.addEventListener("keydown", (e) => {
  if (e.repeat || !activeSketchpad) return
  const action = activeSketchpad.keyMap[e.key]
  if (!action) return

  // Flash the button
  const btn = activeSketchpad.toolbar.querySelector(`[data-action="${action}"]`)
  if (btn) {
    btn.classList.add("flash")
    btn.addEventListener("animationend", () => btn.classList.remove("flash"), { once: true })
  }

  activeSketchpad.doAction(action)
})

document.addEventListener("contextmenu", (e) => e.preventDefault())

// --- Init all embedded sketchpads ---

document.querySelectorAll("[data-lesson]").forEach((el) => {
  createEmbed(el)
})
