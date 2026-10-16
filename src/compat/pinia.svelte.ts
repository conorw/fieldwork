import type { Ref } from "./vue.svelte";

function isRef(value: unknown): value is Ref<unknown> {
  return !!value && typeof value === "object" && (value as Ref<unknown>).__isRef === true;
}

export function defineStore<T extends Record<string, unknown>>(
  _id: string,
  setup: () => T,
) {
  let instance: T | null = null;
  return function useStore() {
    if (instance) return instance;
    let raw: T | null = null;
    const proxy = new Proxy({} as T, {
      get(_target, prop, receiver) {
        if (!raw) return undefined;
        const value = Reflect.get(raw, prop, receiver);
        return isRef(value) ? value.value : value;
      },
      set(_target, prop, value, receiver) {
        if (!raw) return false;
        const current = Reflect.get(raw, prop, receiver);
        if (isRef(current)) {
          current.value = value;
          return true;
        }
        return Reflect.set(raw, prop, value, receiver);
      },
    }) as T;
    instance = proxy;
    raw = setup();
    return instance;
  };
}
