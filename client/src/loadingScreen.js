export function createLoadingScreen(canvas) {// Створення екрана завантаження
  const ctx = canvas.getContext("2d");

  return function updateLoadingScreen(completed, total) {// Оновлення прогресу завантаження
    const width = canvas.width;
    const height = canvas.height;
    const progress = total > 0 ? completed / total : 0;

    ctx.fillStyle = "#080916"; //фон
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#ffffff";//заголовок
    ctx.font = "28px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Loading game...", width / 2, height / 2 - 55);

    const barWidth = Math.min(400, width - 80);// ширина прогрес-бару
    const barHeight = 24;
    const x = (width - barWidth) / 2;
    const y = height / 2 - 10;

    ctx.fillStyle = "#303047";// фон прогрес-бару
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#ff69b4";//заповнена частина прогрес-бару
    ctx.fillRect(x, y, barWidth * progress, barHeight);

    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#ffffff"; //кількість завантажених файлів та відсоток
    ctx.font = "16px Arial";
    ctx.fillText(
      `${completed}/${total} files (${Math.round(progress * 100)}%)`,
      width / 2,
      y + 55
    );
  };
}
