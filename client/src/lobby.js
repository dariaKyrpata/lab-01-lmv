import { fetchJson } from "./assets/loader.js";

export class Lobby extends EventTarget {
  constructor() {
    super();

    this.element = document.createElement("div");

    this.element.style.cssText = `
      position: fixed;
      inset: 0;
      background: #080916;
      color: white;
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 20px;
      z-index: 10;
    `;

    this.element.innerHTML = `
      <h1 style="color:#ff69b4">DOGFIGHT LOBBY</h1>

      <input id="player-name" placeholder="Your name"
        style="padding:12px;font-size:16px">

      <select id="room-select"
        style="padding:12px;font-size:16px;min-width:220px">
      </select>

      <button id="join-button"
        style="padding:12px 35px;background:#ff69b4;
        border:0;border-radius:8px;cursor:pointer">
        Join Game
      </button>

      <p id="lobby-status">Loading rooms...</p>
    `;

    this.controller = null;
    this.interval = null;

    this.element.querySelector("#join-button")
      .addEventListener("click", () => this.join());
  }

  async refresh() {
    if (!this.element.isConnected) return;

    this.controller?.abort();
    this.controller = new AbortController();

    const signal = AbortSignal.any([
      this.controller.signal,
      AbortSignal.timeout(3000)
    ]);

    try {
      const rooms = await fetchJson("/api/rooms", { signal });

      if (!this.element.isConnected) return;

      const select = this.element.querySelector("#room-select");
      const selected = select.value;

      select.replaceChildren();

      for (const room of rooms) {
        const option = document.createElement("option");

        option.value = room.id;
        option.textContent =
          `${room.name} (${room.players}/${room.maxPlayers})`;

        option.disabled = room.players >= room.maxPlayers;

        select.appendChild(option);
      }

      if (
        [...select.options].some(
          (option) => option.value === selected
        )
      ) {
        select.value = selected;
      }

      this.element.querySelector("#lobby-status").textContent =
        rooms.length > 0
          ? "Select a room to start"
          : "No rooms available";
    } catch (error) {
      if (!this.element.isConnected) return;

      if (
        error.name !== "AbortError" &&
        error.name !== "TimeoutError"
      ) {
        console.error("Room loading failed:", error);
      }

      this.element.querySelector("#lobby-status").textContent =
        "Cannot load rooms. Retrying...";
    }
  }

  show() {
    document.body.appendChild(this.element);

    this.refresh();

    this.interval = setInterval(
      () => this.refresh(),
      5000
    );
  }

  hide() {
    clearInterval(this.interval);
    this.interval = null;

    this.controller?.abort();
    this.element.remove();
  }

  join() {
    const name = this.element
      .querySelector("#player-name")
      .value.trim();

    const roomId = this.element
      .querySelector("#room-select")
      .value;

    if (!name || !roomId) {
      this.element.querySelector("#lobby-status").textContent =
        "Enter your name and choose a room";
      return;
    }

    this.dispatchEvent(
      new CustomEvent("join", {
        detail: { name, roomId }
      })
    );

    this.hide();
  }
}
