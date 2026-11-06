import { z } from "zod";

const HealthSchema = z.object({ gitSha: z.string() });

export function enableProductionFeatures(panel: HTMLElement) {
  const version = document.createElement("small");
  version.textContent = "Build: dev";
  panel.append(version);
  void fetch("/health", { signal: AbortSignal.timeout(5000) })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      const parsed = HealthSchema.safeParse(data);
      if (parsed.success) {
        version.textContent = "Build: " + parsed.data.gitSha.slice(0, 10);
        version.title = parsed.data.gitSha;
      }
    })
    .catch(() => {});

  if (window.isSecureContext && "serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js").catch(error => console.warn("Service worker unavailable", error));
  }
}
