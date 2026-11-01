import { GameConnection } from "./connection.js";

export class Online extends EventTarget {
  constructor() {
    super();

    this.connection = new GameConnection();

    this.panel = document.createElement("section");

    this.panel.style.cssText = `
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 20;
      width: 310px;
      max-width: calc(100vw - 24px);
      max-height: 75vh;
      display: none;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
      box-sizing: border-box;
      border: 1px solid #ff69b4;
      border-radius: 12px;
      background: rgba(8, 9, 22, 0.95);
      color: white;
      font: 14px Arial, sans-serif;
    `;

    this.panel.innerHTML = `
      <div style="
        color:#ff69b4;
        font-size:16px;
        font-weight:bold;
      ">
        SPACE DOGFIGHT · ONLINE
      </div>

      <div class="online-status"
        style="font-size:12px;color:#cccccc">
        Connecting...
      </div>

      <div class="online-players"
        style="font-size:12px">
        Players: waiting...
      </div>

      <div class="online-messages"
        style="
          min-height:100px;
          max-height:200px;
          overflow-y:auto;
          overflow-wrap:anywhere;
          white-space:pre-wrap;
          border:1px solid #45445b;
          border-radius:6px;
          padding:9px;
        ">
      </div>

      <form class="online-form"
        style="display:flex;gap:6px">

        <input
          class="online-input"
          type="text"
          maxlength="500"
          placeholder="Write a message..."
          style="
            flex:1;
            min-width:0;
            padding:9px;
            border:0;
            border-radius:6px;
          "
        >

        <button type="submit"
          style="
            padding:9px 12px;
            border:0;
            border-radius:6px;
            background:#ff69b4;
            color:#111;
            cursor:pointer;
          ">
          Send
        </button>
      </form>
    `;

    document.body.appendChild(this.panel);

    this.status = this.panel.querySelector(".online-status");
    this.players = this.panel.querySelector(".online-players");
    this.messages = this.panel.querySelector(".online-messages");
    this.form = this.panel.querySelector(".online-form");
    this.input = this.panel.querySelector(".online-input");

    this.setupEvents();
  }

  addMessage(text) {
    const line = document.createElement("div");
    line.textContent = text;
    line.style.marginBottom = "6px";

    this.messages.appendChild(line);
    this.messages.scrollTop = this.messages.scrollHeight;

    while (this.messages.children.length > 100) {
      this.messages.firstElementChild.remove();
    }
  }

  setupEvents() {
    for (const type of ["keydown", "keyup"]) {
      this.input.addEventListener(type, (event) => {
        event.stopPropagation();
      });
    }

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();

      const message = this.input.value.trim();

      if (!message) return;

      this.connection.sendChat(message);
      this.input.value = "";
    });

    this.connection.addEventListener("joined", (event) => {
      this.status.textContent = "Connected to room";
      this.addMessage("You joined the room.");

      this.dispatchEvent(
        new CustomEvent("joined", {
          detail: event.detail
        })
      );
    });

    this.connection.addEventListener("roster", (event) => {
      this.updatePlayers(event.detail);
    });

    this.connection.addEventListener("room_state", (event) => {
      this.updatePlayers(event.detail);
    });

    this.connection.addEventListener("chat", (event) => {
      const message = event.detail;
      const name =
        message.name ?? message.playerName ?? "Player";

      this.addMessage(`${name}: ${message.text ?? ""}`);
    });

    this.connection.addEventListener("disconnected", (event) => {
      this.status.textContent =
        `Disconnected (${event.detail.code})`;
    });

    this.connection.addEventListener("reconnecting", (event) => {
      const seconds = Math.ceil(event.detail.delay / 1000);

      this.status.textContent =
        `Reconnecting in ${seconds}s...`;
    });

    this.connection.addEventListener("error", (event) => {
      this.status.textContent =
        event.detail.message ?? "Connection error";
    });

    window.addEventListener("beforeunload", () => {
      this.connection.disconnect();
    });
  }

  updatePlayers(data) {
    const list = data.players ?? [];

    if (!Array.isArray(list)) return;

    const names = list.map((player) =>
      typeof player === "string"
        ? player
        : player.name ?? "Player"
    );

    this.players.textContent =
      `Players (${names.length}): ${names.join(", ")}`;
  }

  connect(name, roomId) {
    this.panel.style.display = "flex";

    this.status.textContent = "Connecting...";
    this.players.textContent = "Players: waiting...";
    this.messages.replaceChildren();

    this.connection.connect(name, roomId);
  }

  disconnect() {
    this.connection.disconnect();
    this.panel.style.display = "none";
  }
}
