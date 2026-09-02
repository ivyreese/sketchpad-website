const SKIP = new Set(["HTML", "BODY", "SECTION", "CANVAS"])

const maxPull = 60 // px — rubber-band saturates here, however far you drag
const torque = 0.0001 // how strongly the lever arm twists the element
const maxSpin = 10 // deg — clamp the rotation
const ease = 0.5 // lerp per frame: lags while dragging, springs back on release
const epsilon = 0.1 // how close do we need to be to the original pos/rot before calling the lerp done

// this global, plus the fact that we bail on clicks if there's already an active elm, sucks
let active = null

const clamp = (i, l, h) => Math.max(l, Math.min(h, i))

function start(e) {
  if (e.button !== 0 || active) return

  const elm = e.target
  if (!(elm instanceof HTMLElement) || SKIP.has(elm.tagName)) return

  elm.style.willChange = "transform"

  const rect = elm.getBoundingClientRect()
  active = {
    el: elm,
    dragging: true,

    // mouse origin
    ox: e.clientX,
    oy: e.clientY,

    // lever arm from element centre
    rx: e.clientX - (rect.left + rect.width / 2),
    ry: e.clientY - (rect.top + rect.height / 2),

    // target transform (driven by the mouse)
    tx: 0,
    ty: 0,
    tr: 0, // rotation

    // current transform (lerped toward target)
    cx: 0,
    cy: 0,
    cr: 0, // rotation
  }

  // stop text/image selection while dragging (clicks still fire)
  // note this seems a bit busted
  e.preventDefault()

  window.addEventListener("mousemove", move)
  window.addEventListener("mouseup", end)
  requestAnimationFrame(tick)
}

function move(e) {
  if (!active) return
  const dx = e.clientX - active.ox
  const dy = e.clientY - active.oy
  const dist = Math.hypot(dx, dy)

  // rubber band
  const k = maxPull / (maxPull + dist)
  active.tx = dx * k
  active.ty = dy * k

  // torque
  const spin = (active.rx * active.ty - active.ry * active.tx) * torque
  active.tr = clamp(spin, -maxSpin, maxSpin)
}

function end() {
  if (!active) return
  active.dragging = false
  active.tx = active.ty = active.tr = 0 // spring home
  window.removeEventListener("mousemove", move)
  window.removeEventListener("mouseup", end)
}

function tick() {
  if (!active) return
  const a = active
  a.cx += (a.tx - a.cx) * ease
  a.cy += (a.ty - a.cy) * ease
  a.cr += (a.tr - a.cr) * ease

  // settled after release? clean up and let go
  if (!a.dragging && Math.abs(a.cx) < epsilon && Math.abs(a.cy) < epsilon && Math.abs(a.cr) < epsilon) {
    a.el.style.transform = ""
    a.el.style.willChange = ""
    active = null
    return
  }

  a.el.style.transform = `translate(${a.cx}px, ${a.cy}px) rotate(${a.cr}deg)`
  requestAnimationFrame(tick)
}

window.addEventListener("mousedown", start)
