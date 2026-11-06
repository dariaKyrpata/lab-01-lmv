import type { createInput } from "./input.ts";

export function mountTouchControls(input: ReturnType<typeof createInput>) {
  const style = document.createElement("style");
  style.textContent = ".touch-controls{display:none}@media(pointer:coarse){.in-match .touch-controls{display:flex;justify-content:space-between;position:fixed;bottom:max(14px,env(safe-area-inset-bottom));left:12px;right:12px;z-index:21;pointer-events:none}.touch-controls div{display:flex;gap:6px}.touch-controls button{pointer-events:auto;touch-action:none;padding:10px;min-width:44px;min-height:44px;color:#fff;background:#151a35d9;border:1px solid #ff69b4;border-radius:8px;font:600 14px system-ui}.touch-controls button:active{background:#71345e}}";
  document.head.append(style);

  const controls = document.createElement("section");
  controls.className = "touch-controls";
  controls.setAttribute("aria-label", "Сенсорне керування");
  const steering = document.createElement("div");
  const actions = document.createElement("div");

  function button(group: HTMLElement, label: string, code: string, title: string) {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = label;
    control.setAttribute("aria-label", title);
    control.addEventListener("pointerdown", event => {
      event.preventDefault();
      control.setPointerCapture(event.pointerId);
      input.setTouch(code, true);
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
      control.addEventListener(event, () => input.setTouch(code, false));
    }
    group.append(control);
  }

  button(steering, "◀", "ArrowLeft", "Повернути ліворуч");
  button(steering, "▶", "ArrowRight", "Повернути праворуч");
  button(actions, "▲", "ArrowUp", "Газ");
  button(actions, "●", "Space", "Вогонь");
  controls.append(steering, actions);
  document.body.append(controls);
}
