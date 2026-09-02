const FREEFORM_BUTTONS = [
  { action: "line", label: "line", key: "1" },
  { action: "done", label: "done", key: "2" },
  { action: "clear", label: "clear", key: "3" },
]

const FREEFORM_ACTIONS = {
  line(app) { app.moreLines() },
  done(app) { app.moreLines(); app.endLines() },
  clear(app) { app.drawing().clear() },
}

export const lessons = {
  freeform: {
    buttons: FREEFORM_BUTTONS,
    actions: FREEFORM_ACTIONS,
  },

  intro: {
    async *script(pad) {
      pad.setButtons([])

      pad.showMessage("Try moving the pen")
      await pad.waitForPenMovement(1000)

      pad.setButtons([{ action: "ping", label: "ping", key: "1" }])
      pad.showMessage("With your other hand, press 1 (one) on your keyboard.")
      yield "ping"
      pad.ping()

      pad.showMessage("Nice! Try it a few more times.")
      for (let i = 0; i < 5; i++) {
        yield "ping"
        pad.ping()
      }

      pad.showMessage("You've got it!")
      while (true) {
        yield "ping"
        pad.ping()
      }
    },
  },
}
