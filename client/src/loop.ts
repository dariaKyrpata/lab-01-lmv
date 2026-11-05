interface LoopOptions {
  step?: number;
  simulate: (dt: number) => void;
  render: (alpha: number) => void;
}

export function createLoop({ step = 1 / 60, simulate, render }: LoopOptions) {
  let lastTime = performance.now();
  let accumulator = 0;
  let frameId: number | undefined;

  let framesThisSecond = 0;
  let stepsThisSecond = 0;
  let lastStatTime = lastTime;

  let stats = { fps: 0, stepsPerSecond: 0, frameTime: 0 };

  function frame(currentTime: number) {
    let deltaTime = (currentTime - lastTime) / 1000;
    if (deltaTime > 0.25) deltaTime = 0.25;

    stats.frameTime = currentTime - lastTime;

    accumulator += deltaTime;
    lastTime = currentTime;

    while (accumulator >= step) {
      simulate(step);
      stepsThisSecond++;
      accumulator -= step;
    }

    render(accumulator / step);
    framesThisSecond++;

    if (currentTime - lastStatTime >= 1000) {
      stats.fps = framesThisSecond;
      stats.stepsPerSecond = stepsThisSecond;
      framesThisSecond = 0;
      stepsThisSecond = 0;
      lastStatTime = currentTime;
    }

    frameId = requestAnimationFrame(frame);
  }

  return {
    start: () => {
      lastTime = performance.now();
      lastStatTime = lastTime;
      frameId = requestAnimationFrame(frame);
    },
    stop: () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      frameId = undefined;
    },
    getStats: () => stats,
  };
}
