/**
 * LAN addresses such as http://192.168.x.x are not a secure context, so
 * browsers omit crypto.randomUUID and navigator.locks. PowerSync needs both
 * to write a cemetery. Each page and worker must import this module.
 */
const held = [];
const queue = [];

function blocked(name) {
  return held.some((lock) => lock.name === name);
}

function pump() {
  for (let i = 0; i < queue.length; ) {
    const waiter = queue[i];
    if (blocked(waiter.name)) {
      i += 1;
      continue;
    }
    queue.splice(i, 1);
    const lock = { name: waiter.name, mode: waiter.mode };
    held.push(lock);
    waiter.grant(lock);
  }
}

function release(lock) {
  const index = held.indexOf(lock);
  if (index >= 0) held.splice(index, 1);
  pump();
}

function installNavigatorLocks() {
  if (typeof navigator === "undefined" || navigator.locks) return;
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      async request(name, optionsOrCallback, maybeCallback) {
        const options =
          typeof optionsOrCallback === "function" ? {} : optionsOrCallback || {};
        const callback =
          typeof optionsOrCallback === "function"
            ? optionsOrCallback
            : maybeCallback;
        if (!callback) throw new TypeError("Lock callback is required");
        const mode = options.mode === "shared" ? "shared" : "exclusive";
        if (options.signal?.aborted) {
          throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
        }
        if (options.ifAvailable && blocked(name)) return callback(null);

        const lock = await new Promise((grant, fail) => {
          const waiter = { name, mode, grant, fail };
          if (options.signal) {
            options.signal.addEventListener(
              "abort",
              () => {
                const index = queue.indexOf(waiter);
                if (index >= 0) queue.splice(index, 1);
                fail(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          }
          queue.push(waiter);
          pump();
        });

        try {
          return await callback(lock);
        } finally {
          release(lock);
        }
      },
      async query() {
        const describe = (lock) => ({
          name: lock.name,
          mode: lock.mode,
          clientId: "fieldwork-locks",
        });
        return { held: held.map(describe), pending: queue.map(describe) };
      },
    },
  });
}

function installRandomUUID() {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.randomUUID === "function") return;
  Object.defineProperty(cryptoObj, "randomUUID", {
    configurable: true,
    value() {
      const bytes = cryptoObj.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  });
}

const CACHE_DB = "fieldwork-insecure-cache";

function openCacheDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("entries")) {
        db.createObjectStore("entries");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let cacheDbPromise = null;
function cacheDb() {
  if (!cacheDbPromise) {
    cacheDbPromise = openCacheDb().catch((error) => {
      cacheDbPromise = null;
      throw error;
    });
  }
  return cacheDbPromise;
}

function requestUrl(request) {
  if (typeof request === "string") return request;
  if (request && typeof request.url === "string") return request.url;
  return String(request);
}

function idbRequest(mode, run) {
  return cacheDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("entries", mode);
        const result = run(tx.objectStore("entries"));
        tx.oncomplete = () => resolve(result ? result.result : undefined);
        tx.onerror = (event) => {
          event.preventDefault();
          reject(tx.error);
        };
        tx.onabort = () => reject(tx.error || new Error("Cache transaction aborted"));
      }),
  );
}

class InsecureCache {
  constructor(name) {
    this.name = name;
  }

  async match(request) {
    const key = [this.name, requestUrl(request)];
    const record = await idbRequest("readonly", (store) => store.get(key));
    if (!record) return undefined;
    return new Response(record.body, {
      status: record.status,
      statusText: record.statusText,
      headers: record.headers,
    });
  }

  async put(request, response) {
    const key = [this.name, requestUrl(request)];
    const body = await response.blob();
    const headers = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });
    const record = {
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
    };
    await cacheDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction("entries", "readwrite");
          tx.objectStore("entries").put(record, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error("Cache write aborted"));
        }),
    );
  }

  async delete(request) {
    const key = [this.name, requestUrl(request)];
    await cacheDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction("entries", "readwrite");
          tx.objectStore("entries").delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        }),
    );
    return true;
  }

  async keys() {
    const name = this.name;
    const keys = await idbRequest("readonly", (store) => store.getAllKeys());
    return (keys || [])
      .filter((key) => Array.isArray(key) && key[0] === name)
      .map((key) => new Request(key[1]));
  }
}

function installCacheStorage() {
  if (typeof globalThis.caches !== "undefined") return;
  if (typeof indexedDB === "undefined" || typeof Response === "undefined") return;

  const opened = new Map();
  globalThis.caches = {
    async open(name) {
      let cache = opened.get(name);
      if (!cache) {
        cache = new InsecureCache(name);
        opened.set(name, cache);
      }
      return cache;
    },
    async has(name) {
      if (opened.has(name)) return true;
      const keys = await idbRequest("readonly", (store) => store.getAllKeys());
      return (keys || []).some((key) => Array.isArray(key) && key[0] === name);
    },
    async keys() {
      const keys = await idbRequest("readonly", (store) => store.getAllKeys());
      return [...new Set((keys || []).filter(Array.isArray).map((key) => key[0]))];
    },
    async delete(name) {
      opened.delete(name);
      const keys = await idbRequest("readonly", (store) => store.getAllKeys());
      const doomed = (keys || []).filter((key) => Array.isArray(key) && key[0] === name);
      await cacheDb().then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction("entries", "readwrite");
            const store = tx.objectStore("entries");
            for (const key of doomed) store.delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          }),
      );
      return true;
    },
    async match(request) {
      for (const name of await this.keys()) {
        const cache = await this.open(name);
        const hit = await cache.match(request);
        if (hit) return hit;
      }
      return undefined;
    },
  };
}

installNavigatorLocks();
installRandomUUID();
installCacheStorage();
