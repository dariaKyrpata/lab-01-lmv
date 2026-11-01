const sleep = (ms, signal) => // Асинхронне очікування з можливістю скасування
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(() => { // Завершення очікування після затримки
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() { // Скасування таймера
      clearTimeout(timer);
      reject(signal.reason);
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function fetchJson(url, { signal } = {}) { // Завантаження JSON з повторними спробами
  return retry(
    async () => {
      const response = await fetch(url, { signal });

      if (!response.ok) { // Перевірка HTTP-відповіді
        const error = new Error(`HTTP ${response.status}: ${url}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    },
    { signal }
  );
}

async function retry(operation, { signal, attempts = 3 } = {}) {// Повторення запиту після тимчасових помилок
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal?.throwIfAborted();

    try {
      return await operation();
    } catch (error) {
      if (signal?.aborted) throw error;// Не повторюємо скасовані операції

      const retryable = //перевірка помилок
        error.status >= 500 ||
        (error.status === undefined &&
          (error instanceof TypeError || error.name === "TimeoutError"));

      if (!retryable || attempt === attempts - 1) { // Завершення, якщо повторення неможливе
        throw error;
      }

      const delay = 300 * 2 ** attempt + Math.random() * 200;// Збільшення затримки з випадковою добавкою
      await sleep(delay, signal);
    }
  }
}

export async function loadImage(url, { signal } = {}) {// Асинхронне завантаження зображення
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
          reject(signal.reason);
        };

        if (signal?.aborted) {
          reject(signal.reason);
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

export async function loadAudio(url, audioContext, { signal } = {}) {// Завантаження та декодування звуку
  const data = await retry(
    async () => {
      const response = await fetch(url, { signal });

      if (!response.ok) { // Перевірка HTTP-відповіді
        const error = new Error(`HTTP ${response.status}: ${url}`);
        error.status = response.status;
        throw error;
      }

      return response.arrayBuffer();// Отримання двійкових даних аудіофайлу
    },
    { signal }
  );

  signal?.throwIfAborted(); // Перевірка скасування перед декодуванням
  return audioContext.decodeAudioData(data);// Підготовка звуку до відтворення
}

export async function loadAll(// Паралельне завантаження всіх ресурсів гри
  manifest,
  audioContext,
  { signal, onProgress = () => {} } = {}
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

  const assets = {
    sprites: {},
    audio: {},
    arena: null
  };

  await Promise.all( // Одночасне завантаження ресурсів через Promise.all
    entries.map(async ({ type, name, url }) => {
      let result;

      if (type === "sprites") {// Вибір функції залежно від типу ресурсу
        result = await loadImage(url, { signal });
        assets.sprites[name] = result;
      } else if (type === "audio") {
        result = await loadAudio(url, audioContext, { signal });
        assets.audio[name] = result;
      } else {
        result = await fetchJson(url, { signal });
        assets.arena = result;
      }

      completed++;// Оновлення прогресу завантаження
      onProgress(completed, total, url);
    })
  );

  return assets;
}
