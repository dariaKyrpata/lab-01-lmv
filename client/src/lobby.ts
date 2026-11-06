import { requireElement } from "./dom.ts";
import type { ColorId } from "../../shared/src/colors.ts";
import { Bus } from "./bus.ts";
import { z } from "zod";
import { RoomSummarySchema } from "../../shared/src/protocol/messages.ts";
import type { RoomSummary, ServerMessageOf } from "../../shared/src/protocol/messages.ts";

interface LobbyEvents {
  join: { name: string; roomId: string; colorId: ColorId };
}

const RoomsSchema = z.array(RoomSummarySchema);

import { fetchJson } from "./assets/loader.ts";

import {
  SHIP_COLORS,
  getShipColor,
} from "../../shared/src/colors.ts";

export class Lobby extends Bus<LobbyEvents> {
  declare rooms: RoomSummary[];
  declare selectedColorId: ColorId | null;
  declare busy: boolean;
  declare notice: string;
  declare controller: AbortController | null;
  declare interval: ReturnType<typeof setInterval> | null;
  declare roomsSignature: string;
  declare readonly element: HTMLDivElement;
  declare readonly colorButtons: Map<ColorId, { button: HTMLButtonElement; availability: HTMLElement }>;
  declare readonly nameInput: HTMLInputElement;
  declare readonly roomSelect: HTMLSelectElement;
  declare readonly joinButton: HTMLButtonElement;
  declare readonly status: HTMLElement;
  declare readonly preview: HTMLElement;

  constructor() {
    super();

    this.rooms = [];
    this.selectedColorId = null;
    this.busy = false;
    this.notice = "";

    this.controller = null;
    this.interval = null;
    this.roomsSignature = "";

    this.element = document.createElement("div");
    this.element.className = "dogfight-lobby";

    this.element.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 30;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: safe center;
      gap: 18px;
      padding: 24px;
      box-sizing: border-box;
      overflow-y: auto;
      background: #080916;
      color: white;
      font-family: Arial, sans-serif;
    `;

    this.element.innerHTML = `
      <h1 style="margin: 0; color: #ff69b4">
        DOGFIGHT LOBBY
      </h1>

      <input
        id="player-name"
        placeholder="Твоє ім’я"
        aria-label="Ім’я гравця"
        maxlength="24"
        style="
          width: 280px;
          max-width: 100%;
          box-sizing: border-box;
          padding: 12px;
          font-size: 16px;
        "
      >

      <select
        id="room-select"
        aria-label="Кімната"
        style="
          width: 280px;
          max-width: 100%;
          padding: 12px;
          font-size: 16px;
        "
      ></select>

      <fieldset style="
        width: 400px;
        max-width: 100%;
        box-sizing: border-box;
        padding: 16px;
        border: 1px solid #45445b;
        border-radius: 12px;
      ">
        <legend style="padding: 0 8px">
          Колір корабля
        </legend>

        <div
          class="color-options"
          role="radiogroup"
          aria-label="Колір корабля"
          style="
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 10px;
          "
        ></div>
      </fieldset>

      <img
        class="ship-preview"
        src="/assets/sprites/ship.png"
        alt="Вигляд обраного корабля"
        width="80"
        height="80"
        style="visibility: hidden; object-fit: contain"
      >

      <button
        id="join-button"
        type="button"
        disabled
        style="
          padding: 12px 35px;
          border: 0;
          border-radius: 8px;
          background: #ff69b4;
          color: #111111;
          font-size: 16px;
          cursor: pointer;
        "
      >
        Приєднатися
      </button>

      <p
        id="lobby-status"
        role="status"
        aria-live="polite"
        style="
          margin: 0;
          max-width: 400px;
          text-align: center;
          color: #ffb4c8;
        "
      >
        Завантаження кімнат...
      </p>
    `;

    this.nameInput = requireElement(this.element, "#player-name", HTMLInputElement);

    this.roomSelect = requireElement(this.element, "#room-select", HTMLSelectElement);

    this.joinButton = requireElement(this.element, "#join-button", HTMLButtonElement);

    this.status = requireElement(this.element, "#lobby-status", HTMLElement);

    this.preview = requireElement(this.element, ".ship-preview", HTMLElement);

    this.colorButtons = new Map();

    const options = requireElement(this.element, ".color-options", HTMLElement);

    for (const color of SHIP_COLORS) {
      const button = document.createElement("button");

      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", "false");

      button.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        min-width: 140px;
        padding: 12px;
        border: 2px solid #45445b;
        border-radius: 10px;
        background: #14162a;
        color: white;
        cursor: pointer;
      `;

      const dot = document.createElement("span");

      dot.style.cssText = `
        width: 24px;
        height: 24px;
        border-radius: 50%;
      `;

      dot.style.backgroundColor = color.color;

      const name = document.createElement("span");
      name.textContent = color.name;

      const availability = document.createElement(
        "small"
      );

      button.append(dot, name, availability);
      options.appendChild(button);

      this.colorButtons.set(color.id, {
        button,
        availability,
      });

      button.addEventListener("click", () => {
        if (this.busy || button.disabled) {
          return;
        }

        this.selectedColorId = color.id;
        this.notice = "";

        this.renderColors();
        this.updateControls();
      });
    }

    this.nameInput.addEventListener("input", () => {
      this.notice = "";
      this.updateControls();
    });

    this.roomSelect.addEventListener("change", () => {
      this.notice = "";
      this.renderColors();
      this.updateControls();
    });

    this.joinButton.addEventListener("click", () => {
      this.join();
    });
  }

  get selectedRoom() {
    return this.rooms.find(
      (room) => room.id === this.roomSelect.value
    ) ?? null;
  }

  renderRooms() {
    const signature = JSON.stringify(this.rooms);

    if (signature === this.roomsSignature) {
      return;
    }

    this.roomsSignature = signature;

    const selected = this.roomSelect.value;

    this.roomSelect.replaceChildren();

    for (const room of this.rooms) {
      const option = document.createElement("option");

      option.value = room.id;
      option.textContent =
        `${room.name} (${room.players}/${room.maxPlayers})`;

      option.disabled =
        room.players >= room.maxPlayers;

      this.roomSelect.appendChild(option);
    }

    if (this.rooms.some((room) => room.id === selected)) {
      this.roomSelect.value = selected;
    } else {
      const available = this.rooms.find(
        (room) => room.players < room.maxPlayers
      );

      this.roomSelect.value =
        available?.id ?? this.rooms[0]?.id ?? "";
    }
  }

  renderColors() {
    const room = this.selectedRoom;
    const taken = new Set(room?.takenColors ?? []);

    if (
      (this.selectedColorId !== null && taken.has(this.selectedColorId)) ||
      !getShipColor(this.selectedColorId)
    ) {
      this.selectedColorId = null;
    }

    for (const color of SHIP_COLORS) {
      const controls = this.colorButtons.get(color.id);
      if (!controls) continue;
      const { button, availability } = controls;

      const occupied = taken.has(color.id);
      const selected =
        this.selectedColorId === color.id;

      button.disabled =
        this.busy ||
        !room ||
        room.players >= room.maxPlayers ||
        occupied;

      button.setAttribute(
        "aria-checked",
        String(selected)
      );

      button.style.borderColor = selected
        ? color.color
        : "#45445b";

      button.style.opacity = occupied ? "0.4" : "1";

      button.style.cursor = button.disabled
        ? "not-allowed"
        : "pointer";

      availability.textContent = !room
        ? "Вибери кімнату"
        : occupied
          ? "Зайнятий"
          : "Вільний";
    }

    const selectedColor = getShipColor(
      this.selectedColorId
    );

    this.preview.style.visibility =
      selectedColor ? "visible" : "hidden";

    this.preview.style.filter =
      selectedColor?.filter ?? "none";
  }

  updateControls() {
    const room = this.selectedRoom;

    const colorAvailable =
      this.selectedColorId !== null &&
      !(room?.takenColors ?? []).includes(
        this.selectedColorId
      );

    const canJoin =
      Boolean(this.nameInput.value.trim()) &&
      room !== null &&
      room.players < room.maxPlayers &&
      colorAvailable;

    this.nameInput.disabled = this.busy;
    this.roomSelect.disabled =
      this.busy || this.rooms.length === 0;

    this.joinButton.disabled =
      this.busy || !canJoin;

    this.joinButton.style.opacity =
      this.joinButton.disabled ? "0.5" : "1";

    this.joinButton.textContent = this.busy
      ? "Підключення..."
      : "Приєднатися";

    if (this.busy) {
      this.status.textContent =
        "Очікуємо підтвердження сервера...";
    } else if (this.notice) {
      this.status.textContent = this.notice;
    } else if (!room) {
      this.status.textContent =
        "Немає доступних кімнат.";
    } else if (room.players >= room.maxPlayers) {
      this.status.textContent =
        "Кімната заповнена. Вибери іншу.";
    } else if (!this.selectedColorId) {
      this.status.textContent =
        "Вибери вільний колір корабля.";
    } else if (!this.nameInput.value.trim()) {
      this.status.textContent =
        "Введи своє ім’я.";
    } else {
      this.status.textContent =
        "Можна приєднуватися.";
    }
  }

  async refresh() {
    if (!this.element.isConnected) {
      return;
    }

    this.controller?.abort();

    const controller = new AbortController();
    this.controller = controller;

    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(3000),
    ]);

    try {
      const rooms = await fetchJson(
        "/api/rooms",
        { signal }
      );

      if (
        !this.element.isConnected ||
        this.controller !== controller
      ) {
        return;
      }

      this.rooms = RoomsSchema.parse(rooms);

      this.renderRooms();
      this.renderColors();
      this.updateControls();
    } catch (error) {
      if (
        !this.element.isConnected ||
        this.controller !== controller ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        return;
      }

      if (!this.busy) {
        this.status.textContent =
          "Не вдалося оновити кімнати. Повторюємо...";
      }
    }
  }

  show() {
    if (this.element.isConnected) {
      return;
    }

    this.busy = false;

    document.body.appendChild(this.element);

    this.renderColors();
    this.updateControls();
    void this.refresh();

    this.interval = setInterval(
      () => { void this.refresh(); },
      1500
    );
  }

  hide() {
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;

    this.controller?.abort();
    this.controller = null;

    this.busy = false;
    this.notice = "";

    this.element.remove();
  }

  rejectJoin(detail: Partial<ServerMessageOf<"join_error">> = {}) {
    this.busy = false;

    this.notice =
      detail.message ??
      "Не вдалося приєднатися. Спробуй ще раз.";

    const room = this.rooms.find(
      (item) => item.id === detail.room
    );

    if (
      room &&
      Array.isArray(detail.takenColors)
    ) {
      room.takenColors = [...detail.takenColors];
    }

    if (!this.element.isConnected) {
      this.show();
    } else {
      void this.refresh();
    }

    this.renderColors();
    this.updateControls();
  }

  join() {
    if (this.busy) {
      return;
    }

    const name = this.nameInput.value.trim();
    const room = this.selectedRoom;
    const colorId = this.selectedColorId;

    if (
      !name ||
      !room ||
      room.players >= room.maxPlayers ||
      colorId === null ||
      (room.takenColors ?? []).includes(colorId)
    ) {
      this.renderColors();
      this.updateControls();
      return;
    }

    this.busy = true;
    this.notice = "";

    this.renderColors();
    this.updateControls();

    this.emit("join", { name, roomId: room.id, colorId });
  }
}