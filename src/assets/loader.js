const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason);
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function fetchJson(url, { signal } = {}) {
  return retry(
    async () => {
      const response = await fetch(url, { signal });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${url}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    },
    { signal }
  );
}

async function retry(operation, { signal, attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal?.throwIfAborted();

    try {
      return await operation();
    } catch (error) {
      if (signal?.aborted) throw error;

      const retryable =
        error.status >= 500 ||
        (error.status === undefined &&
          (error instanceof TypeError || error.name === "TimeoutError"));

      if (!retryable || attempt === attempts - 1) {
        throw error;
      }

      const delay = 300 * 2 ** attempt + Math.random() * 200;
      await sleep(delay, signal);
    }
  }
}

export async function loadImage(url, { signal } = {}) {
  return retry(
    () =>
      new Promise((resolve, reject) => {
        const image = new Image();

        const cleanup = () => {
          image.onload = null;
          image.onerror = null;
          signal?.removeEventListener("abort", onAbort);
        };

        const onAbort = () => {
          cleanup();
          image.src = "";
          reject(signal.reason);
        };

        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }

        image.onload = () => {
          cleanup();
          resolve(image);
        };

        image.onerror = () => {
          cleanup();
          reject(new Error(`Cannot load image: ${url}`));
        };

        signal?.addEventListener("abort", onAbort, { once: true });
        image.src = url;
      }),
    { signal }
  );
}

export async function loadAudio(url, audioContext, { signal } = {}) {
  const data = await retry(
    async () => {
      const response = await fetch(url, { signal });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${url}`);
        error.status = response.status;
        throw error;
      }

      return response.arrayBuffer();
    },
    { signal }
  );

  signal?.throwIfAborted();
  return audioContext.decodeAudioData(data);
}

export async function loadAll(
  manifest,
  audioContext,
  { signal, onProgress = () => {} } = {}
) {
  const entries = [
    ...Object.entries(manifest.sprites).map(([name, url]) => ({
      type: "sprites",
      name,
      url
    })),
    ...Object.entries(manifest.audio).map(([name, url]) => ({
      type: "audio",
      name,
      url
    })),
    { type: "arena", name: "config", url: manifest.arena }
  ];

  const total = entries.length;
  let completed = 0;

  const assets = {
    sprites: {},
    audio: {},
    arena: null
  };

  await Promise.all(
    entries.map(async ({ type, name, url }) => {
      let result;

      if (type === "sprites") {
        result = await loadImage(url, { signal });
        assets.sprites[name] = result;
      } else if (type === "audio") {
        result = await loadAudio(url, audioContext, { signal });
        assets.audio[name] = result;
      } else {
        result = await fetchJson(url, { signal });
        assets.arena = result;
      }

      completed++;
      onProgress(completed, total, url);
    })
  );

  return assets;
}
