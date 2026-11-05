export function createAudio(audioContext: AudioContext, sounds: Readonly<Record<string, AudioBuffer>>) {// Створення системи звукових ефектів
  let unlocked = false;

  async function unlock() {// Активація звуку після взаємодії з грою
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    unlocked = audioContext.state === "running";
  }

  function play(name: string) { // Відтворення звуку за назвою
    const buffer = sounds[name];
    if (!unlocked || !buffer) return;

    const source = audioContext.createBufferSource();// Створення джерела звуку
    source.buffer = buffer;

    const gain = audioContext.createGain(); // Налаштування гучності
    gain.gain.value = name === "shoot" ? 0.25 : 0.45;

    source.connect(gain); // Підключення звуку до виходу
    gain.connect(audioContext.destination);

    source.start(); // Відтворення звуку
  }

  return { unlock, play };
}
