import "../utils/insecureContext.js";

if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister();
  });
}

import { Buffer } from "buffer";
window.Buffer = Buffer;
globalThis.Buffer = Buffer;

import "../utils/consoleLogger";
import "../services/initQueueProcessor";

import { App as CapacitorApp } from "@capacitor/app";
import { usePowerSyncStore } from "../stores/powersync";
import { useSettingsStore } from "../stores/settings";
import { useMapStore } from "../stores/map";
import { useAuthStore } from "../stores/auth";

let started = false;

export async function boot() {
  if (started) return;
  started = true;

  const powerSyncStore = usePowerSyncStore();
  const settingsStore = useSettingsStore();
  const mapStore = useMapStore();
  const authStore = useAuthStore();

  try {
    await authStore.init();
    if (authStore.isAuthenticated && authStore.session) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      powerSyncStore.initialize().catch((error: Error) => {
        console.error("Failed to initialize PowerSync store:", error);
      });
    }
  } catch (error: unknown) {
    console.error("Failed to initialize auth store:", error);
  }

  mapStore.initialize().catch((error: Error) => {
    console.error("Failed to initialize map store:", error);
  });

  settingsStore.initializeWithGPS().catch((error: Error) => {
    console.error("Failed to initialize settings with GPS:", error);
  });

  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const applyColorScheme = () => {
    document.documentElement.classList.toggle("app-dark", colorScheme.matches);
  };
  applyColorScheme();
  colorScheme.addEventListener("change", applyColorScheme);

  if ("Notification" in window) {
    Notification.requestPermission();
  }

  if (
    import.meta.env.PROD &&
    "serviceWorker" in navigator &&
    location.hostname === "fieldwork.conorw.workers.dev"
  ) {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  }

  let deferredPrompt: any = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent("pwa-install-prompt-available"));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent("pwa-installed"));
  });

  (window as any).__deferredPrompt = () => deferredPrompt;
  (window as any).__clearDeferredPrompt = () => {
    deferredPrompt = null;
  };

  CapacitorApp.addListener("appStateChange", ({ isActive }: { isActive: boolean }) => {
    console.log("App state changed. Is active?", isActive);
  });

  CapacitorApp.addListener("appUrlOpen", (event: { url: string }) => {
    console.log("App opened with URL:", event.url);
  });

  CapacitorApp.addListener("backButton", ({ canGoBack }: { canGoBack: boolean }) => {
    if (!canGoBack) {
      CapacitorApp.exitApp();
    } else {
      window.history.back();
    }
  });
}
