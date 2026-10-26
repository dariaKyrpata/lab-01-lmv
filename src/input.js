export function createInput(target) {
  const down = new Set(); //натиснуті клавіші
  const pressed = new Set(); //клавіші, які були натиснуті один раз

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
    pressed.clear();
  });

  return {
    isDown(code) { //перевіряє, чи клавіша утримується
      return down.has(code);
    },

    justPressed(code) { //перевіряє, чи клавіша була натиснута один раз
      if (!pressed.has(code)) {
        return false;
      }

      pressed.delete(code); //видаляє клавішу з набору натиснутих клавіш після перевірки
      return true;
    },

    clearPressed() {//очищає набір натиснутих клавіш
      pressed.clear();
    },
  };
}
