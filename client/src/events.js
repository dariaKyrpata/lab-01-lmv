export const gameEvents = new EventTarget();

export function emitGameEvent(name, detail = {}) { //функція для надсилання подій гри 
  gameEvents.dispatchEvent( // Створення та відправлення події з додатковими даними
    new CustomEvent(name, { detail })
  );
}
