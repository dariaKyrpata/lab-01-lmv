export function createLoadingScreen(canvas) {
  const ctx = canvas.getContext("2d");

  return function updateLoadingScreen(completed, total) {
    const width = canvas.width;
    const height = canvas.height;
    const progress = total > 0 ? completed / total : 0;

    ctx.fillStyle = "#080916";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#ffffff";
    ctx.font = "28px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Loading game...", width / 2, height / 2 - 55);

    const barWidth = Math.min(400, width - 80);
    const barHeight = 24;
    const x = (width - barWidth) / 2;
    const y = height / 2 - 10;

    ctx.fillStyle = "#303047";
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#ff69b4";
    ctx.fillRect(x, y, barWidth * progress, barHeight);

    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.fillText(
      `${completed}/${total} files (${Math.round(progress * 100)}%)`,
      width / 2,
      y + 55
    );
  };
}
