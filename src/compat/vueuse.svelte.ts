import { ref } from "./vue.svelte";

export function useStorage<T>(key: string, initial: T) {
  const read = (): T => {
    if (typeof localStorage === "undefined") return initial;
    const raw = localStorage.getItem(key);
    if (raw == null) return initial;
    if (typeof initial === "string") return raw as T;
    if (typeof initial === "number") return Number(raw) as T;
    if (typeof initial === "boolean") return (raw === "true") as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  };

  const stored = ref(read());
  return {
    __isRef: true as const,
    get value() {
      return stored.value;
    },
    set value(next: T) {
      stored.value = next;
      if (typeof localStorage === "undefined") return;
      const text =
        typeof next === "string" ? next : typeof next === "object" && next != null ? JSON.stringify(next) : String(next);
      localStorage.setItem(key, text);
    },
  };
}

export function useGeolocation(options?: PositionOptions) {
  const coords = ref<GeolocationCoordinates | null>(null);
  const error = ref<GeolocationPositionError | null>(null);
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        coords.value = position.coords;
        error.value = null;
      },
      (err) => {
        error.value = err;
      },
      options,
    );
  }
  return { coords, error };
}

export function useOnline() {
  const online = ref(typeof navigator === "undefined" ? true : navigator.onLine);
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      online.value = true;
    });
    window.addEventListener("offline", () => {
      online.value = false;
    });
  }
  return online;
}
