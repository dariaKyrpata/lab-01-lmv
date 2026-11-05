import { GameConnection } from "./connection.js";
import { getShipColor } from "../../shared/src/colors.js";

export class Online extends EventTarget {
  constructor() {
    super();

    this.connection = new GameConnection();

    this.panel = document.createElement("section");

    this.panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 20;
      width: 250px;
      max-width: calc(100vw - 20px);
      max-height: 55vh;
      display: none;
      flex-direction: column;
      gap: 7px;
      padding: 10px;
      box-sizing: border-box;
      overflow-y: auto;
      border: 1px solid #ff69b4;
      border-radius: 10px;
      background: rgba(8, 9, 22, 0.94);
      color: white;
      font: 12px Arial, sans-serif;
    `;

    this.panel.innerHTML = `
      <div class="online-title"
        style="
          font-size: 13px;
          font-weight: bold;
        ">
        SPACE DOGFIGHT · ONLINE
      </div>

      <div class="online-status"
        style="font-size: 11px; color: #cccccc">
        Connecting...
      </div>

      <div class="online-players"
        style="font-size: 11px; line-height: 1.6">
        Players: waiting...
      </div>

      <div class="online-messages"
        style="
          min-height: 55px;
          max-height: 110px;
          overflow-y: auto;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
          border: 1px solid #45445b;
          border-radius: 6px;
          padding: 7px;
          font-size: 12px;
          line-height: 1.4;
        ">
      </div>

      <form class="online-form"
        style="display: flex; gap: 5px">

        <input
          class="online-input"
          type="text"
          maxlength="500"
          placeholder="Повідомлення..."
          aria-label="Повідомлення чату"
          style="
            flex: 1;
            min-width: 0;
            padding: 7px;
            border: 0;
            border-radius: 5px;
            font-size: 12px;
          "
        >

        <button
          class="online-send"
          type="submit"
          style="
            padding: 7px 9px;
            border: 0;
            border-radius: 5px;
            color: #111111;
            font-size: 12px;
            cursor: pointer;
          "
        >
          Надіслати
        </button>
      </form>
    `;

    document.body.appendChild(this.panel);

    this.title = this.panel.querySelector(
      ".online-title"
    );

    this.status = this.panel.querySelector(
      ".online-status"
    );

    this.players = this.panel.querySelector(
      ".online-players"
    );

    this.messages = this.panel.querySelector(
      ".online-messages"
    );

    this.form = this.panel.querySelector(
      ".online-form"
    );

    this.input = this.panel.querySelector(
      ".online-input"
    );

    this.sendButton = this.panel.querySelector(
      ".online-send"
    );

    this.applyColor("pink");
    this.setupEvents();
  }

  applyColor(colorId) {
    const color =
      getShipColor(colorId) ??
      getShipColor("pink");

    this.panel.style.borderColor = color.color;

    this.panel.style.boxShadow =
      `0 0 16px ${color.color}22`;

    this.title.style.color = color.color;

    this.messages.style.borderColor =
      `${color.color}55`;

    this.sendButton.style.backgroundColor =
      color.color;
  }

  forward(type, detail) {
    this.dispatchEvent(
      new CustomEvent(type, { detail })
    );
  }

  addMessage(text) {
    const line = document.createElement("div");

    line.textContent = text;
    line.style.marginBottom = "4px";

    this.messages.appendChild(line);

    this.messages.scrollTop =
      this.messages.scrollHeight;

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

      if (!message) {
        return;
      }

      this.connection.sendChat(message);
      this.input.value = "";
    });

    this.connection.addEventListener(
      "joined",
      (event) => {
        const color = getShipColor(
          event.detail.colorId
        );

        this.applyColor(event.detail.colorId);
        this.panel.style.display = "flex";

        this.status.textContent =
          "Підключено до кімнати";

        this.addMessage(
          color
            ? `Твій колір: ${color.name}.`
            : "Ти приєдналася до кімнати."
        );

        this.forward("joined", event.detail);
      }
    );

    this.connection.addEventListener(
      "join_error",
      (event) => {
        this.panel.style.display = "none";
        this.forward("join_error", event.detail);
      }
    );

    this.connection.addEventListener(
      "roster",
      (event) => {
        this.updatePlayers(event.detail);
      }
    );

    this.connection.addEventListener(
      "room_state",
      (event) => {
        this.updatePlayers(event.detail);
      }
    );

    this.connection.addEventListener(
      "chat",
      (event) => {
        const message = event.detail;

        const name =
          message.name ??
          message.playerName ??
          "Гравець";

        this.addMessage(
          `${name}: ${message.text ?? ""}`
        );
      }
    );

    this.connection.addEventListener(
      "disconnected",
      (event) => {
        this.status.textContent =
          `Відключено (${event.detail.code})`;

        this.forward(
          "disconnected",
          event.detail
        );
      }
    );

    this.connection.addEventListener(
      "reconnecting",
      (event) => {
        const seconds = Math.ceil(
          event.detail.delay / 1000
        );

        this.status.textContent =
          `Повторне підключення через ${seconds} с...`;
      }
    );

    this.connection.addEventListener(
      "error",
      (event) => {
        this.status.textContent =
          event.detail.message ??
          "Помилка підключення";

        this.forward("error", event.detail);
      }
    );

    window.addEventListener("beforeunload", () => {
      this.connection.disconnect();
    });
  }

  updatePlayers(data) {
    const list = data.players ?? [];

    if (!Array.isArray(list)) {
      return;
    }

    this.players.textContent =
      `Гравці (${list.length}): `;

    for (const player of list) {
      const isObject =
        player !== null &&
        typeof player === "object";

      const name =
        typeof player === "string"
          ? player
          : isObject
            ? player.name ?? "Гравець"
            : "Гравець";

      const color = isObject
        ? getShipColor(player.colorId)
        : null;

      const label = document.createElement("span");

      label.textContent = `● ${name}`;
      label.style.color = color?.color ?? "#ffffff";
      label.style.display = "inline-block";
      label.style.marginRight = "8px";

      this.players.appendChild(label);
    }
  }

  connect(name, roomId, colorId = "pink") {
    this.applyColor(colorId);

    this.panel.style.display = "none";
    this.status.textContent = "Підключення...";
    this.players.textContent = "Очікуємо гравців...";
    this.messages.replaceChildren();

    this.connection.connect(name, roomId, colorId);
  }

  disconnect() {
    this.connection.disconnect();
    this.panel.style.display = "none";
  }
}