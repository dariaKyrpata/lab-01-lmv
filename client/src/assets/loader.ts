export interface LoadOptions {
  signal?: AbortSignal;
  attempts?: number;
}

export interface Manifest {
  sprites: Record<string, string>;
  audio: Record<string, string>;
  arena: string;
}

export interface GameAssets {
  sprites: Record<string, HTMLImageElement>;
  audio: Record<string, AudioBuffer>;
  arena: unknown;
}

function requestError(status: number, url: string) {
  return Object.assign(new Error(`HTTP ${status}: ${url}`), { status });
}

const sleep = (ms: number, signal?: AbortSignal) => // Асинхронне очікування з можливістю скасування
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal?.reason);
      return;
    }

    const timer = setTimeout(() => { // Завершення очікування після затримки
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() { // Скасування таймера
      clearTimeout(timer);
      reject(signal?.reason);
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function fetchJson(url: string, { signal }: LoadOptions = {}): Promise<unknown> { // Завантаження JSON з повторними спробами
  return retry(
    async () => {
      const response = await fetch(url, { signal });

      if (!response.ok) { // Перевірка HTTP-відповіді
        throw requestError(response.status, url);
      }

      const value: unknown = await response.json();
      return value;
    },
    { signal }
  );
}

async function retry<T>(operation: () => Promise<T>, { signal, attempts = 3 }: LoadOptions = {}): Promise<T> {// Повторення запиту після тимчасових помилок
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal?.throwIfAborted();

    try {
      return await operation();
    } catch (error) {
      if (signal?.aborted) throw error;// Не повторюємо скасовані операції

      const status = error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : undefined;
      const retryable = //перевірка помилок
        (status !== undefined && status >= 500) ||
        (status === undefined &&
          (error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError")));

      if (!retryable || attempt === attempts - 1) { // Завершення, якщо повторення неможливе
        throw error;
      }

      const delay = 300 * 2 ** attempt + Math.random() * 200;// Збільшення затримки з випадковою добавкою
      await sleep(delay, signal);
    }
  }

  throw new Error("At least one attempt is required");
}

export async function loadImage(url: string, { signal }: LoadOptions = {}): Promise<HTMLImageElement> {// Асинхронне завантаження зображення
  return retry(
    () =>
      new Promise((resolve, reject) => {
        const image = new Image();

        const cleanup = () => {// Очищення обробників подій
          image.onload = null;
          image.onerror = null;
          signal?.removeEventListener("abort", onAbort);
        };

        const onAbort = () => { // Скасування завантаження зображення
          cleanup();
          image.src = "";
          reject(signal?.reason);
        };

        if (signal?.aborted) {
          reject(signal?.reason);
          return;
        }

        image.onload = () => { // Успішне завантаження зображення
          cleanup();
          resolve(image);
        };

        image.onerror = () => { // Помилка завантаження зображення
          cleanup();
          reject(new Error(`Cannot load image: ${url}`));
        };

        signal?.addEventListener("abort", onAbort, { once: true });
        image.src = url;
      }),
    { signal }
  );
}

export async function loadAudio(url: string, audioContext: AudioContext, { signal }: LoadOptions = {}) {// Завантаження та декодування звуку
  const data = await retry(
    async () => {
      const response = await fetch(url, { signal });

      if (!response.ok) { // Перевірка HTTP-відповіді
        throw requestError(response.status, url);
      }

      return response.arrayBuffer();// Отримання двійкових даних аудіофайлу
    },
    { signal }
  );

  signal?.throwIfAborted(); // Перевірка скасування перед декодуванням
  return audioContext.decodeAudioData(data);// Підготовка звуку до відтворення
}

export async function loadAll(// Паралельне завантаження всіх ресурсів гри
  manifest: Manifest,
  audioContext: AudioContext,
  { signal, onProgress = () => {} }: LoadOptions & { onProgress?: (completed: number, total: number, url: string) => void } = {}
) {
  const entries = [ // Створення списку ресурсів із маніфесту
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

  const assets: GameAssets = {
    sprites: {},
    audio: {},
    arena: null
  };

  await Promise.all( // Одночасне завантаження ресурсів через Promise.all
    entries.map(async ({ type, name, url }) => {
      if (type === "sprites") {
        assets.sprites[name] = await loadImage(url, { signal });
      } else if (type === "audio") {
        assets.audio[name] = await loadAudio(url, audioContext, { signal });
      } else {
        assets.arena = await fetchJson(url, { signal });
      }

      completed++;// Оновлення прогресу завантаження
      onProgress(completed, total, url);
    })
  );

  return assets;
}
