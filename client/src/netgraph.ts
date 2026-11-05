import { requireElement } from "./dom.ts";
import type { ColorId } from "../../shared/src/colors.ts";
import type { GameConnection } from "./connection.ts";
import type { Prediction } from "./prediction.ts";
import type { Interpolation } from "./interpolation.ts";
import type { Snapshot } from "../../shared/src/protocol/messages.ts";
import type { Seq, Tick } from "../../shared/src/protocol/ids.ts";
import { ZERO_SEQ, ZERO_TICK } from "../../shared/src/protocol/ids.ts";

import { getShipColor } from "../../shared/src/colors.ts";

export class Netgraph {
  declare readonly connection: GameConnection;
  declare readonly prediction: Prediction | null;
  declare readonly interpolation: Interpolation | null;
  declare readonly panel: HTMLElement;
  declare readonly output: HTMLElement;
  declare readonly form: HTMLFormElement;
  declare readonly title: HTMLElement;
  declare readonly modes: HTMLElement;
  declare readonly summary: HTMLElement;
  declare readonly applyButton: HTMLButtonElement;
  declare rtt: number | null;
  declare offset: number | null;
  declare lastSnapshot: number | null;
  declare tick: Tick;
  declare lastSentSeq: Seq;
  declare lastAckSeq: Seq;
  declare probes: Set<number>;
  declare nextPing: number;
  declare nextPaint: number;
  declare lastMeasure: number;
  declare lastCounts: GameConnection["metrics"];
  declare down: number;
  declare up: number;

    constructor(connection: GameConnection, prediction: Prediction | null = null, interpolation: Interpolation | null = null) {
    this.connection = connection;
    this.prediction = prediction;
    this.interpolation = interpolation;

    this.panel = document.createElement("section");

    this.panel.style.cssText = `
      display: none;
      position: fixed;
      bottom: 34px;
      left: 12px;
      z-index: 21;
      width: 300px;
      max-width: calc(100vw - 24px);
      box-sizing: border-box;
      padding: 10px;
      border: 1px solid #ff69b4;
      border-radius: 10px;
      background: rgba(5, 8, 20, 0.93);
      color: #d6daec;
      font: 11px monospace;
    `;

    this.panel.innerHTML = `
      <strong class="net-title">
        NETGRAPH · M1 · JSON
      </strong>

      <pre class="net-stats"
        style="
          margin: 7px 0;
          line-height: 1.5;
          white-space: pre-wrap;
          font: inherit;
        "
      ></pre>

      <details>
        <summary class="net-summary"
          style="cursor: pointer">
          Налаштування мережі
        </summary>

        <form class="net-form"
          style="
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            align-items: end;
            margin-top: 9px;
          ">

          <label>
            Затримка, мс<br>
            <input
              name="latency"
              type="number"
              min="0"
              max="500"
              value="0"
              required
              style="width: 55px; font-size: 11px"
            >
          </label>

          <label>
            Розкид ±мс<br>
            <input
              name="jitter"
              type="number"
              min="0"
              max="200"
              value="0"
              required
              style="width: 50px; font-size: 11px"
            >
          </label>

          <label>
            Втрати %<br>
            <input
              name="drop"
              type="number"
              min="0"
              max="20"
              step="0.1"
              value="0"
              required
              style="width: 45px; font-size: 11px"
            >
          </label>

          <label>
            Інтерполяція, мс
            <input
              name="interpolationDelay"
              type="number"
              min="0"
              max="500"
              step="10"
              value="${this.interpolation?.delay ?? 100}"
              required
            >
          </label>

          <button class="net-apply"
            type="submit"
            style="
              padding: 5px 8px;
              border: 0;
              border-radius: 5px;
              color: #111111;
              font-size: 11px;
              cursor: pointer;
            ">
            Застосувати
          </button>

          <div style="width: 100%; color: #9aa5c0">
            Затримка задається для кожного напрямку.
          </div>
        </form>
      </details>

      <div class="net-modes" style="
        margin-top: 7px;
        color: #9aa5c0;
        font-size: 10px;
      ">
        Prediction: OFF · Interpolation: OFF
      </div>
    `;

    document.body.appendChild(this.panel);

    this.output = requireElement(this.panel, ".net-stats", HTMLElement);

    this.form = requireElement(this.panel, ".net-form", HTMLFormElement);

    this.title = requireElement(this.panel, ".net-title", HTMLElement);

    this.modes = requireElement(this.panel, ".net-modes", HTMLElement);

    this.summary = requireElement(this.panel, ".net-summary", HTMLElement);

    this.applyButton = requireElement(this.panel, ".net-apply", HTMLButtonElement);

    this.reset();
    this.applyColor("pink");

    for (const type of ["keydown", "keyup"]) {
      this.form.addEventListener(type, (event) => {
        event.stopPropagation();
      });
    }

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (
        !this.connection.joined ||
        !this.form.reportValidity()
      ) {
        return;
      }

      this.sendSettings();
    });

    connection.addEventListener(
      "joined",
      (event) => {
        this.reset();
        this.applyColor(event.detail.colorId);
        this.panel.style.display = "block";
        this.sendSettings();
      }
    );

    connection.addEventListener(
      "disconnected",
      () => {
        this.panel.style.display = "none";
        this.reset();
      }
    );

    connection.addEventListener(
      "net_config",
      () => {
        this.rtt = null;
        this.offset = null;
        this.probes.clear();
        this.nextPing = 0;
      }
    );

    connection.addEventListener(
      "net_pong",
      (event) => {
        const message = event.detail;

        if (
          !Number.isFinite(message.serverTime) ||
          !this.probes.delete(message.clientTime)
        ) {
          return;
        }

        const now = performance.now();

        this.rtt = now - message.clientTime;

        this.offset =
          message.serverTime + this.rtt / 2 - now;
      }
    );
  }

  applyColor(colorId: ColorId) {
    const color =
      getShipColor(colorId) ??
      getShipColor("pink");
    if (!color) return;

    this.panel.style.borderColor = color.color;

    this.panel.style.boxShadow =
      `0 0 16px ${color.color}22`;

    this.title.style.color = color.color;
    this.summary.style.color = color.color;

    this.applyButton.style.backgroundColor =
      color.color;
  }

  reset() {
    this.rtt = null;
    this.offset = null;
    this.lastSnapshot = null;

    this.tick = ZERO_TICK;
    this.lastSentSeq = ZERO_SEQ;
    this.lastAckSeq = ZERO_SEQ;

    this.probes = new Set();
    this.nextPing = 0;
    this.nextPaint = 0;

    this.lastMeasure = performance.now();

    this.lastCounts = {
      ...this.connection.metrics,
    };

    this.down = 0;
    this.up = 0;
  }

  sendSettings() {
    const data = new FormData(this.form);

        if (this.interpolation) {
      this.interpolation.delay = Number(data.get("interpolationDelay"));
    }

    this.connection.sendRaw({
      type: "net_config",
      latency: Number(data.get("latency")),
      jitter: Number(data.get("jitter")),
      drop: Number(data.get("drop")) / 100,
    });
  }

  trackInput(seq: Seq) {
    if (seq > this.lastSentSeq) this.lastSentSeq = seq;
  }

  onSnapshot(message: Snapshot) {
    if (message.tick < this.tick) {
      return;
    }

    this.tick = message.tick;
    this.lastSnapshot = message.sentAt;

    if (message.lastProcessedSeq > this.lastAckSeq) this.lastAckSeq = message.lastProcessedSeq;
  }

  render() {
    if (!this.connection.joined) {
      return;
    }

    const now = performance.now();

    if (now >= this.nextPing) {
      const sent = this.connection.sendRaw({
        type: "net_ping",
        clientTime: now,
      });

      if (sent) {
        this.probes.add(now);

        if (this.probes.size > 8) {
          const oldest = this.probes
            .values()
            .next()
            .value;

          if (oldest !== undefined) this.probes.delete(oldest);
        }
      }

      this.nextPing = now + 1000;
    }

    if (now - this.lastMeasure >= 1000) {
      const seconds =
        (now - this.lastMeasure) / 1000;

      this.down =
        (
          this.connection.metrics.received -
          this.lastCounts.received
        ) / seconds;

      this.up =
        (
          this.connection.metrics.sent -
          this.lastCounts.sent
        ) / seconds;

      this.lastCounts = {
        ...this.connection.metrics,
      };

      this.lastMeasure = now;
    }

    if (now < this.nextPaint) {
      return;
    }

    this.nextPaint = now + 100;

    const rtt =
      this.rtt === null
        ? "..."
        : `${this.rtt.toFixed(0)} ms`;

    const age =
      this.lastSnapshot === null ||
      this.offset === null
        ? "..."
        : `${Math.max(
            0,
            now + this.offset - this.lastSnapshot
          ).toFixed(0)} ms`;

        const pending = this.prediction
      ? this.prediction.pending.length
      : Math.max(0, this.lastSentSeq - this.lastAckSeq);

    const correction = this.prediction
      ? `${this.prediction.correction.toFixed(2)} од.`
      : "—";

     const stage = this.interpolation
      ? "M3"
      : this.prediction
        ? "M2"
        : "M1";

    const format = this.connection.wireFormat === "binary"
      ? "BINARY"
      : "JSON";

    this.title.textContent = `NETGRAPH · ${stage} · ${format}`;

    const interpolationStatus = this.interpolation
      ? `ON (${this.interpolation.delay} ms)`
      : "OFF";

    this.modes.textContent =
      `Prediction: ${this.prediction ? "ON" : "OFF"}` +
      ` · Interpolation: ${interpolationStatus}`;

    this.output.textContent = [
      `RTT: ${rtt} | Age ~ ${age}`,
      `↓ ${this.down.toFixed(0)} B/s  ↑ ${this.up.toFixed(0)} B/s`,
      `Input queue: ${pending} | Tick: ${this.tick}`,
      `Correction: ${correction}`,
    ].join("\n");
  }
}