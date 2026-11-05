import { getShipColor } from "../../shared/src/colors.js";

export class Netgraph {
    constructor(connection, prediction = null, interpolation = null) {
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

    this.output = this.panel.querySelector(
      ".net-stats"
    );

    this.form = this.panel.querySelector(
      ".net-form"
    );

    this.title = this.panel.querySelector(
      ".net-title"
    );
    
    this.modes = this.panel.querySelector(".net-modes");

    this.summary = this.panel.querySelector(
      ".net-summary"
    );

    this.applyButton = this.panel.querySelector(
      ".net-apply"
    );

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

  applyColor(colorId) {
    const color =
      getShipColor(colorId) ??
      getShipColor("pink");

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

    this.tick = 0;
    this.lastSentSeq = 0;
    this.lastAckSeq = 0;

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

  trackInput(seq) {
    this.lastSentSeq = Math.max(
      this.lastSentSeq,
      seq
    );
  }

  onSnapshot(message) {
    if (message.tick < this.tick) {
      return;
    }

    this.tick = message.tick;
    this.lastSnapshot = message.sentAt;

    this.lastAckSeq = Math.max(
      this.lastAckSeq,
      message.lastProcessedSeq
    );
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

          this.probes.delete(oldest);
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