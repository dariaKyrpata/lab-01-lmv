export function createInput(target) {
    // Створюємо дві закриті "коробочки" (множини) для кнопок
    const down = new Set();
    const pressed = new Set();

    // Коли кнопка натискається вниз
    target.addEventListener("keydown", (e) => {
        if (!down.has(e.code)) {
            pressed.add(e.code); // Фіксуємо одиночне натискання
        }
        down.add(e.code); // Фіксуємо, що кнопка затиснута
    });

    // Коли кнопку відпускають
    target.addEventListener("keyup", (e) => {
        down.delete(e.code);
    });

    // Повертаємо пульт керування з двома кнопками
    return {
        // Перевіряє, чи кнопка зараз затиснута (для газу)
        isDown: (code) => down.has(code),
        
        // Перевіряє, чи кнопку щойно натиснули один раз (наприклад, для пострілу)
        justPressed: (code) => {
            if (pressed.has(code)) {
                pressed.delete(code);
                return true;
            }
            return false;
        }
    };
}