export function createInput(target: Window) {
  const down = new Set<string>(); //натиснуті клавіші
  const touch = new Set<string>();
  let touchHeading: number | null = null;
  const pressed = new Set<string>(); //клавіші, які були натиснуті один раз

  const gameKeys = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Space",
  ]);

  target.addEventListener("keydown", (event) => { //обробка натискання клавіші
    if (gameKeys.has(event.code)) {
      event.preventDefault();
    }

    if (!down.has(event.code)) { //запам'ятовує, що клавіша була натиснута
      pressed.add(event.code);
    }

    down.add(event.code); //запам'ятовує, що клавіша утримується
  });

  target.addEventListener("keyup", (event) => { //обробка відпускання клавіші
    down.delete(event.code);
  });

  target.addEventListener("blur", () => { //якщо втрачається фокус, очищає натиснуті клавіші
    down.clear();
    touch.clear();
    touchHeading = null;
    pressed.clear();
  });

  return {
    isDown(code: string) { //перевіряє, чи клавіша утримується
      return down.has(code) || touch.has(code);
    },

    justPressed(code: string) { //перевіряє, чи клавіша була натиснута один раз
      if (!pressed.has(code)) {
        return false;
      }

      pressed.delete(code); //видаляє клавішу з набору натиснутих клавіш після перевірки
      return true;
    },

    get touchHeading() {
      return touchHeading;
    },

    setTouchHeading(heading: number | null) {
      touchHeading = heading;
    },

    setTouch(code: string, active: boolean) {
      if (active && !touch.has(code)) pressed.add(code);
      if (active) touch.add(code);
      else touch.delete(code);
    },

    reset() {
      down.clear();
      touch.clear();
      touchHeading = null;
      pressed.clear();
    },

    clearPressed() {//очищає набір натиснутих клавіш
      pressed.clear();
    },
  };
}
