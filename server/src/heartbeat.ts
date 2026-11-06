interface Peer {
  readyState: number;
  missedPongs: number;
  ping(): void;
  terminate(): void;
}

export function startHeartbeat(peers: Iterable<Peer>, interval: number, maxMisses: number) {
  return setInterval(() => {
    for (const peer of peers) {
      if (peer.readyState !== 1) continue;
      if (peer.missedPongs >= maxMisses) {
        peer.terminate();
        continue;
      }
      peer.missedPongs++;
      try {
        peer.ping();
      } catch {
        peer.terminate();
      }
    }
  }, interval);
}
