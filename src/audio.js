export function createAudio(audioContext, sounds) {
  let unlocked = false;

  async function unlock() {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    unlocked = audioContext.state === "running";
  }

  function play(name) {
    if (!unlocked || !sounds[name]) return;

    const source = audioContext.createBufferSource();
    source.buffer = sounds[name];

    const gain = audioContext.createGain();
    gain.gain.value = name === "shoot" ? 0.25 : 0.45;

    source.connect(gain);
    gain.connect(audioContext.destination);

    source.start();
  }

  return { unlock, play };
}
