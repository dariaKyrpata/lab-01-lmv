import { normalizeAngle } from "../movement.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_BYTES = 1024 * 1024;

export class BinaryWriter {
  constructor() {
    this.buffer = new ArrayBuffer(1024);
    this.view = new DataView(this.buffer);
    this.offset = 0;
  }

  reserve(size) {
    const required = this.offset + size;

    if (required > MAX_BYTES) {
      throw new RangeError("Binary packet is too large");
    }

    if (required <= this.buffer.byteLength) {
      return;
    }

    const capacity = Math.min(
      MAX_BYTES,
      Math.max(required, this.buffer.byteLength * 2)
    );

    const buffer = new ArrayBuffer(capacity);

    new Uint8Array(buffer).set(
      new Uint8Array(this.buffer)
    );

    this.buffer = buffer;
    this.view = new DataView(buffer);
  }

  write(method, size, value) {
    if (!Number.isFinite(value)) {
      throw new TypeError("Expected a finite number");
    }

    this.reserve(size);
    this.view[method](this.offset, value, true);
    this.offset += size;
  }

  uint8(value) {
    this.write("setUint8", 1, value);
  }

  uint16(value) {
    this.write("setUint16", 2, value);
  }

  int16(value) {
    this.write("setInt16", 2, value);
  }

  uint32(value) {
    this.write("setUint32", 4, value);
  }

  float32(value) {
    this.write("setFloat32", 4, value);
  }

  float64(value) {
    this.write("setFloat64", 8, value);
  }

  angle(value) {
    this.int16(
      Math.round(normalizeAngle(value) / Math.PI * 32767)
    );
  }

  text(value) {
    if (typeof value !== "string") {
      throw new TypeError("Expected a string");
    }

    const bytes = encoder.encode(value);

    if (bytes.byteLength > 65535) {
      throw new RangeError("String is too long");
    }

    this.uint16(bytes.byteLength);
    this.reserve(bytes.byteLength);

    new Uint8Array(
      this.buffer,
      this.offset,
      bytes.byteLength
    ).set(bytes);

    this.offset += bytes.byteLength;
  }

  finish() {
    return this.buffer.slice(0, this.offset);
  }
}

export class BinaryReader {
  constructor(data) {
    if (data instanceof ArrayBuffer) {
      this.view = new DataView(data);
    } else if (ArrayBuffer.isView(data)) {
      this.view = new DataView(
        data.buffer,
        data.byteOffset,
        data.byteLength
      );
    } else {
      throw new TypeError("Expected binary data");
    }

    if (this.view.byteLength > MAX_BYTES) {
      throw new RangeError("Binary packet is too large");
    }

    this.offset = 0;
  }

  require(size) {
    if (this.offset + size > this.view.byteLength) {
      throw new RangeError("Incomplete binary packet");
    }
  }

  read(method, size) {
    this.require(size);

    const value = this.view[method](this.offset, true);

    this.offset += size;

    if (!Number.isFinite(value)) {
      throw new TypeError("Invalid binary number");
    }

    return value;
  }

  uint8() {
    return this.read("getUint8", 1);
  }

  uint16() {
    return this.read("getUint16", 2);
  }

  int16() {
    return this.read("getInt16", 2);
  }

  uint32() {
    return this.read("getUint32", 4);
  }

  float32() {
    return this.read("getFloat32", 4);
  }

  float64() {
    return this.read("getFloat64", 8);
  }

  angle() {
    return this.int16() / 32767 * Math.PI;
  }

  text() {
    const length = this.uint16();

    this.require(length);

    const bytes = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      length
    );

    const value = decoder.decode(bytes);

    this.offset += length;

    return value;
  }

  finish() {
    if (this.offset !== this.view.byteLength) {
      throw new Error("Unexpected trailing binary data");
    }
  }
}