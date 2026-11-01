export const PROTOCOL_VERSION = 1;

export const MAX_MESSAGE_BYTES = 4096;
export const MAX_CHAT_LENGTH = 500;
export const MAX_NAME_LENGTH = 24;

export const CLOSE_CODES = {
  INVALID_MESSAGE: 1008,
  TOO_LARGE: 1009,
  JOIN_TIMEOUT: 1008,
  RATE_LIMIT: 1008,
  SERVER_SHUTDOWN: 1001
};

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

export function validateMessage(data) {
  let raw;

  if (typeof data === "string") {
    raw = data;
  } else if (Buffer.isBuffer(data)) {
    raw = data.toString("utf8");
  } else {
    return {
      ok: false,
      error: "Unsupported message format",
      closeCode: CLOSE_CODES.INVALID_MESSAGE
    };
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_MESSAGE_BYTES) {
    return {
      ok: false,
      error: "Message too large",
      closeCode: CLOSE_CODES.TOO_LARGE
    };
  }

  let message;

  try {
    message = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: "Invalid JSON",
      closeCode: CLOSE_CODES.INVALID_MESSAGE
    };
  }

  if (!isObject(message)) {
    return {
      ok: false,
      error: "Message must be an object",
      closeCode: CLOSE_CODES.INVALID_MESSAGE
    };
  }

  if (message.version !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error: "Unsupported protocol version",
      closeCode: CLOSE_CODES.INVALID_MESSAGE
    };
  }

  switch (message.type) {
    case "join": {
      if (
        !isValidString(message.room, 100) ||
        !isValidString(message.name, MAX_NAME_LENGTH)
      ) {
        return {
          ok: false,
          error: "Invalid join message",
          closeCode: CLOSE_CODES.INVALID_MESSAGE
        };
      }

      if (
        Object.keys(message).some(
          (key) => !["version", "type", "room", "name"].includes(key)
        )
      ) {
        return {
          ok: false,
          error: "Unexpected join fields",
          closeCode: CLOSE_CODES.INVALID_MESSAGE
        };
      }

      return {
        ok: true,
        message: {
          version: PROTOCOL_VERSION,
          type: "join",
          room: message.room,
          name: message.name.trim()
        }
      };
    }

    case "chat": {
      if (!isValidString(message.text, MAX_CHAT_LENGTH)) {
        return {
          ok: false,
          error: "Invalid chat message",
          closeCode: CLOSE_CODES.INVALID_MESSAGE
        };
      }

      if (
        Object.keys(message).some(
          (key) => !["version", "type", "text"].includes(key)
        )
      ) {
        return {
          ok: false,
          error: "Unexpected chat fields",
          closeCode: CLOSE_CODES.INVALID_MESSAGE
        };
      }

      return {
        ok: true,
        message: {
          version: PROTOCOL_VERSION,
          type: "chat",
          text: message.text.trim()
        }
      };
    }

    case "leave": {
      if (
        Object.keys(message).some(
          (key) => !["version", "type"].includes(key)
        )
      ) {
        return {
          ok: false,
          error: "Unexpected leave fields",
          closeCode: CLOSE_CODES.INVALID_MESSAGE
        };
      }

      return {
        ok: true,
        message: {
          version: PROTOCOL_VERSION,
          type: "leave"
        }
      };
    }

    default:
      return {
        ok: false,
        error: "Unknown message type",
        closeCode: CLOSE_CODES.INVALID_MESSAGE
      };
  }
}
