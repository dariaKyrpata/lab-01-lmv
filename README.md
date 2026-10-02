# Lab 01 - Experiments

## Experiment 1: Synchronous Block
**What the player sees:** The game freezes completely for a fraction of a second every second. The movement stutters, and the ship teleports slightly after the freeze.
**What the HUD does:** The FPS drops from 60 (or 144) down to a lower number because the 100ms block prevents the browser from rendering frames. 
**Explanation:** JavaScript is single-threaded. When the `while` loop runs synchronously for 100ms on the main thread, the call stack is blocked. The event loop cannot process any other tasks, microtasks, or the rendering step (requestAnimationFrame). It cannot be "worked around" from the same thread because the engine must finish executing the current function before it can pull anything else from the queue.
## Experiment 2: setInterval vs requestAnimationFrame
**Observations:** 
1. The FPS and frame-time jitter constantly. `setInterval` doesn't align with the monitor's display refresh rate, making the animation less smooth. 16ms is roughly 62.5 FPS, not exactly 60.
2. When switching to a background tab, `setInterval` keeps running blindly, wasting CPU and battery. 
**Explanation:** `requestAnimationFrame` is specifically designed for rendering. It syncs directly with the display's VSync (usually 60Hz or 144Hz) and pauses completely when the tab is hidden to save resources.
## Experiment 3: Variable Timestep (No Accumulator)
**Observations:** When the CPU is throttled 6x in DevTools, the frame rate drops significantly. Because the simulation step (`dt`) is directly tied to the fluctuating frame time instead of being fixed, the ship's final position after 5 seconds of thrust is entirely different from the unthrottled run. 
**Explanation:** A fixed timestep ensures that the physics engine always advances by the exact same time increments (1/60s). If we remove the accumulator and pass the raw frame time to the simulation, floating-point math errors and large physics steps cause the trajectory to diverge. This makes the physics non-deterministic, which would completely break a multiplayer game because every player would see the ship in a different place.