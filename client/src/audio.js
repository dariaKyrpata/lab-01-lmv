export function createAudio(audioContext, sounds) {// Створення системи звукових ефектів
  let unlocked = false;

  async function unlock() {// Активація звуку після взаємодії з грою
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    unlocked = audioContext.state === "running";
  }

  function play(name) { // Відтворення звуку за назвою
    if (!unlocked || !sounds[name]) return;

    const source = audioContext.createBufferSource();// Створення джерела звуку
    source.buffer = sounds[name];

    const gain = audioContext.createGain(); // Налаштування гучності
    gain.gain.value = name === "shoot" ? 0.25 : 0.45;

    source.connect(gain); // Підключення звуку до виходу
    gain.connect(audioContext.destination);

    source.start(); // Відтворення звуку
  }

  return { unlock, play };
}
