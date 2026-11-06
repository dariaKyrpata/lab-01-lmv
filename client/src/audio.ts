export function createAudio(audioContext: AudioContext, sounds: Readonly<Record<string, AudioBuffer>>) {
  function play(name: string) {
    const buffer = sounds[name];
    if (audioContext.state !== "running" || !buffer) return false;

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    const gain = audioContext.createGain();
    gain.gain.value = name === "shoot" ? 0.25 : 0.45;
    source.connect(gain);
    gain.connect(audioContext.destination);
    source.addEventListener("ended", () => {
      source.disconnect();
      gain.disconnect();
    }, { once: true });
    source.start();
    return true;
  }

  return { play };
}
