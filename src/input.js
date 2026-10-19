export function createInput(target) {
  const down = new Set();
  const pressed = new Set();

  const gameKeys = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Space",
  ]);

  target.addEventListener("keydown", (event) => {
    if (gameKeys.has(event.code)) {
      event.preventDefault();
    }

    if (!down.has(event.code)) {
      pressed.add(event.code);
    }

    down.add(event.code);
  });

  target.addEventListener("keyup", (event) => {
    down.delete(event.code);
  });

  target.addEventListener("blur", () => {
    down.clear();
    pressed.clear();
  });

  return {
    isDown(code) {
      return down.has(code);
    },

    justPressed(code) {
      if (!pressed.has(code)) {
        return false;
      }

      pressed.delete(code);
      return true;
    },

    clearPressed() {
      pressed.clear();
    },
  };
}
