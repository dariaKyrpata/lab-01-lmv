import { defineConfig } from "vite";

export default defineConfig({// Налаштування Vite
  server: {
    host: "127.0.0.1",
    port: 5173,

    proxy: { // Запити до API пересилаємо на сервер
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true
      },

      "/ws": { // WebSocket підключаємо до сервера
        target: "ws://127.0.0.1:3000",
        ws: true,
        changeOrigin: true
      }
    }
  }
});
