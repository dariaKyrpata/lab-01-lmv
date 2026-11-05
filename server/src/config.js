import path from "node:path";

function readPort(value) {// перевіряєм номер порту
  const port = Number(value ?? 3000);// якщо не вказано, то 3000

  if (!Number.isInteger(port) || port < 1 || port > 65535) { //перевіряєм чи правильний
    throw new Error("Invalid PORT: must be 1–65535");
  }

  return port;
}

function readLogDir(value) {// Перевіряємо папку для логів
  const logDir = value ?? "./logs";

  if (typeof logDir !== "string" || !logDir.trim()) { // Перевіряємо, чи шлях не порожній
    throw new Error("Invalid LOG_DIR");
  }

  return path.resolve(logDir);
}

export const config = {// Налаштування сервера
  port: readPort(process.env.PORT),
  host: process.env.HOST || "127.0.0.1",
  logDir: readLogDir(process.env.LOG_DIR),
};
