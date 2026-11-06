const enabled = new URLSearchParams(globalThis.location?.search).has("profile");

export function measure<T>(name: string, operation: () => T): T {
  if (!enabled) return operation();
  const start = performance.now();
  try {
    return operation();
  } finally {
    performance.measure(name, { start, end: performance.now() });
    performance.clearMeasures(name);
  }
}
