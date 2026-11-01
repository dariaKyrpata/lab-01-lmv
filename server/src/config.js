import path from "node:path";

function readPort(value) {
  const port = Number(value ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PORT: must be 1–65535");
  }

  return port;
}

function readLogDir(value) {
  const logDir = value ?? "./logs";

  if (typeof logDir !== "string" || !logDir.trim()) {
    throw new Error("Invalid LOG_DIR");
  }

  return path.resolve(logDir);
}

export const config = {
  port: readPort(process.env.PORT),
  host: process.env.HOST || "127.0.0.1",
  logDir: readLogDir(process.env.LOG_DIR),
};
