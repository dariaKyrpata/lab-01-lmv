import {
  PROTOCOL_VERSION,
  isInput,
} from "../../shared/src/protocol/messages.js";

import {
  getShipColor,
} from "../../shared/src/colors.js";

export { PROTOCOL_VERSION };

export const MAX_MESSAGE_BYTES = 4096;
export const MAX_CHAT_LENGTH = 500;
export const MAX_NAME_LENGTH = 24;

export const CLOSE_CODES = {
  INVALID_MESSAGE: 1008,
  TOO_LARGE: 1009,
  JOIN_TIMEOUT: 1008,
  RATE_LIMIT: 1008,
  SERVER_SHUTDOWN: 1001,
};

function invalid(
  error,
  closeCode = CLOSE_CODES.INVALID_MESSAGE
) {
  return {
    ok: false,
    error,
    closeCode,
  };
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isValidString(value, maxLength) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function hasOnlyFields(message, allowedFields) {
  return Object.keys(message).every(
    (key) => allowedFields.includes(key)
  );
}

export function validateMessage(data) {
  let raw;

  if (typeof data === "string") {
    raw = data;
  } else if (Buffer.isBuffer(data)) {
    raw = data.toString("utf8");
  } else {
    return invalid("Unsupported message format");
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_MESSAGE_BYTES) {
    return invalid(
      "Message too large",
      CLOSE_CODES.TOO_LARGE
    );
  }

  let message;

  try {
    message = JSON.parse(raw);
  } catch {
    return invalid("Invalid JSON");
  }

  if (!isObject(message)) {
    return invalid("Message must be an object");
  }

  if (message.version !== PROTOCOL_VERSION) {
    return invalid("Unsupported protocol version");
  }

  switch (message.type) {
    case "input": {
      if (!isInput(message)) {
        return invalid("Invalid input");
      }

      return {
        ok: true,
        message,
      };
    }

    case "net_ping": {
      if (
        !Number.isFinite(message.clientTime) ||
        message.clientTime < 0 ||
        !hasOnlyFields(message, [
          "version",
          "type",
          "clientTime",
        ])
      ) {
        return invalid("Invalid ping");
      }

      return {
        ok: true,
        message,
      };
    }

    case "net_config": {
      const { latency, jitter, drop } = message;

      if (
        !Number.isFinite(latency) ||
        latency < 0 ||
        latency > 500 ||
        !Number.isFinite(jitter) ||
        jitter < 0 ||
        jitter > 200 ||
        !Number.isFinite(drop) ||
        drop < 0 ||
        drop > 0.2 ||
        !hasOnlyFields(message, [
          "version",
          "type",
          "latency",
          "jitter",
          "drop",
        ])
      ) {
        return invalid("Invalid network settings");
      }

      return {
        ok: true,
        message,
      };
    }

    case "join": {
      if (
        !isValidString(message.room, 100) ||
        !isValidString(message.name, MAX_NAME_LENGTH)
      ) {
        return invalid("Invalid join message");
      }

      if (
        !hasOnlyFields(message, [
          "version",
          "type",
          "room",
          "name",
          "colorId",
        ])
      ) {
        return invalid("Unexpected join fields");
      }

      if (
        message.colorId !== undefined &&
        !getShipColor(message.colorId)
      ) {
        return invalid("Invalid ship color");
      }

      const joinedMessage = {
        version: PROTOCOL_VERSION,
        type: "join",
        room: message.room,
        name: message.name.trim(),
      };

      if (message.colorId !== undefined) {
        joinedMessage.colorId = message.colorId;
      }

      return {
        ok: true,
        message: joinedMessage,
      };
    }

    case "chat": {
      if (
        !isValidString(message.text, MAX_CHAT_LENGTH)
      ) {
        return invalid("Invalid chat message");
      }

      if (
        !hasOnlyFields(message, [
          "version",
          "type",
          "text",
        ])
      ) {
        return invalid("Unexpected chat fields");
      }

      return {
        ok: true,
        message: {
          version: PROTOCOL_VERSION,
          type: "chat",
          text: message.text.trim(),
        },
      };
    }

    case "leave": {
      if (
        !hasOnlyFields(message, [
          "version",
          "type",
        ])
      ) {
        return invalid("Unexpected leave fields");
      }

      return {
        ok: true,
        message: {
          version: PROTOCOL_VERSION,
          type: "leave",
        },
      };
    }

    default:
      return invalid("Unknown message type");
  }
}