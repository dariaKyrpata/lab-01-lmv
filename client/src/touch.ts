import type { createInput } from "./input.ts";

export function mountTouchControls(input: ReturnType<typeof createInput>) {
  const style = document.createElement("style");
  style.textContent = `
    .touch-controls { display: none; }
    @media (any-pointer: coarse) {
      .in-match .touch-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: fixed;
        bottom: max(14px, env(safe-area-inset-bottom));
        left: max(14px, env(safe-area-inset-left));
        right: max(14px, env(safe-area-inset-right));
        z-index: 21;
        pointer-events: none;
      }

      .touch-fire, .touch-joystick {
        display: grid;
        place-items: center;
        border: 1px solid #ff69b4;
        border-radius: 50%;
        background: #151a35c9;
        color: white;
        touch-action: none;
        user-select: none;
        pointer-events: auto;
      }

      .touch-fire {
        width: clamp(56px, 16vmin, 78px);
        aspect-ratio: 1;
        font: 600 13px system-ui;
      }

      .touch-joystick {
        width: clamp(84px, 25vmin, 120px);
        aspect-ratio: 1;
      }

      .touch-stick {
        display: grid;
        place-items: center;
        width: 42%;
        aspect-ratio: 1;
        border: 1px solid #ff69b4;
        border-radius: 50%;
        background: #3b234a;
        font-size: 20px;
        pointer-events: none;
      }

      .touch-fire[data-held] { background: #71345e; }
    }
  `;
  document.head.append(style);

  const controls = document.createElement("section");
  controls.className = "touch-controls";
  controls.setAttribute("aria-label", "Сенсорне керування");

  const fire = document.createElement("button");
  fire.type = "button";
  fire.className = "touch-fire";
  fire.textContent = "Вогонь";

  const joystick = document.createElement("div");
  joystick.className = "touch-joystick";
  joystick.setAttribute("role", "group");
  joystick.setAttribute("aria-label", "Джойстик руху");
  joystick.tabIndex = -1;

  const stick = document.createElement("span");
  stick.className = "touch-stick";
  stick.textContent = "✥";
  stick.setAttribute("aria-hidden", "true");
  joystick.append(stick);

  function updateStick(event: PointerEvent) {
    const bounds = joystick.getBoundingClientRect();
    const x = event.clientX - (bounds.left + bounds.width / 2);
    const y = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(x, y);
    const radius = bounds.width * 0.28;
    const scale = distance > radius ? radius / distance : 1;
    stick.style.transform = `translate(${x * scale}px, ${y * scale}px)`;
    input.setTouchHeading(distance > bounds.width * 0.12 ? Math.atan2(y, x) : null);
  }

  function bindPointer(
    control: HTMLElement,
    onPress: (event: PointerEvent) => void,
    onRelease: () => void,
    onMove?: (event: PointerEvent) => void,
  ) {
    let pointerId: number | null = null;

    function release() {
      if (pointerId === null) return;
      pointerId = null;
      onRelease();
    }

    control.addEventListener("pointerdown", event => {
      if (pointerId !== null || event.button !== 0) return;
      event.preventDefault();
      control.focus({ preventScroll: true });
      pointerId = event.pointerId;
      control.setPointerCapture(pointerId);
      onPress(event);
    });
    control.addEventListener("pointermove", event => {
      if (event.pointerId === pointerId) onMove?.(event);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
      control.addEventListener(type, event => {
        if (event.pointerId === pointerId) release();
      });
    }
    window.addEventListener("blur", release);
  }

  bindPointer(fire, () => {
    fire.dataset.held = "";
    input.setTouch("Space", true);
  }, () => {
    delete fire.dataset.held;
    input.setTouch("Space", false);
  });

  bindPointer(joystick, updateStick, () => {
    stick.style.transform = "";
    input.setTouchHeading(null);
  }, updateStick);

  controls.append(fire, joystick);
  document.body.append(controls);
}
