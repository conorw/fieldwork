import { onDestroy, onMount, tick } from "svelte";

type Listener = () => void;
const listeners = new Set<Listener>();
let scheduled = false;

function notify() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const listener of [...listeners]) listener();
  });
}

export interface Ref<T> {
  __isRef: true;
  value: T;
}

export type ComputedRef<T> = Ref<T>;

export function ref<T>(initial: T): Ref<T> {
  let current = $state(initial);
  return {
    __isRef: true as const,
    get value() {
      return current;
    },
    set value(next: T) {
      current = next;
      notify();
    },
  };
}

export function shallowRef<T>(initial: T) {
  return ref(initial);
}

export function computed<T>(
  fn: (() => T) | { get: () => T; set?: (value: T) => void },
): ComputedRef<T> {
  const read = typeof fn === "function" ? fn : fn.get;
  const write = typeof fn === "function" ? undefined : fn.set;
  return {
    __isRef: true as const,
    get value() {
      return read();
    },
    set value(next: T) {
      write?.(next);
    },
  };
}

export function unref<T>(value: T | Ref<T>): T {
  if (value && typeof value === "object" && (value as Ref<T>).__isRef) {
    return (value as Ref<T>).value;
  }
  return value as T;
}

function readSource(source: unknown): unknown {
  if (typeof source === "function") return (source as () => unknown)();
  if (source && typeof source === "object" && (source as Ref<unknown>).__isRef) {
    return (source as Ref<unknown>).value;
  }
  return source;
}

function changed(next: unknown, prev: unknown, deep: boolean): boolean {
  if (!deep) {
    if (Array.isArray(next) && Array.isArray(prev)) {
      return (
        next.length !== prev.length || next.some((item, index) => !Object.is(item, prev[index]))
      );
    }
    return !Object.is(next, prev);
  }
  try {
    return JSON.stringify(next) !== JSON.stringify(prev);
  } catch {
    return !Object.is(next, prev);
  }
}

export function watch(
  source: unknown,
  callback: (value: unknown, previous: unknown) => void,
  options?: { immediate?: boolean; deep?: boolean },
) {
  const read = () =>
    Array.isArray(source) ? source.map((item) => readSource(item)) : readSource(source);
  let previous = read();
  const run = () => {
    const value = read();
    if (!changed(value, previous, !!options?.deep)) return;
    const old = previous;
    previous = value;
    callback(value, old);
  };
  listeners.add(run);
  if (options?.immediate) {
    // Vue passes an array of undefined for a multi-source watch on the first
    // run. Passing a single undefined makes `([next], [prev])` throw
    // "undefined is not iterable" and takes down the page.
    const initialPrevious = Array.isArray(previous)
      ? previous.map(() => undefined)
      : undefined;
    try {
      const result = callback(previous, initialPrevious) as unknown;
      if (
        result &&
        typeof result === "object" &&
        typeof (result as Promise<unknown>).then === "function"
      ) {
        (result as Promise<unknown>).catch((error) => {
          console.error("watch callback failed:", error);
        });
      }
    } catch (error) {
      console.error("watch callback failed:", error);
    }
  }
  return () => listeners.delete(run);
}

export const onMounted = onMount;
export const onUnmounted = onDestroy;
export const onBeforeUnmount = onDestroy;
export const nextTick = tick;

export function reactive<T extends object>(source: T): T {
  let state = $state(source);
  return state;
}

export function withDefaults<T extends object>(props: T, defaults: Partial<T>): T {
  return new Proxy(props, {
    get(target, key, receiver) {
      let value = Reflect.get(target, key, receiver);
      if (value === undefined && typeof key === "string") {
        const kebab = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        if (kebab !== key) value = Reflect.get(target, kebab, receiver);
      }
      if (value === undefined && typeof key === "string" && key in defaults) {
        return defaults[key as keyof T];
      }
      return value;
    },
  });
}
