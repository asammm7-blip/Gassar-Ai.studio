const DB_NAME = 'gassar_ai_db';
const STORE_NAME = 'kv';
const MIGRATION_FLAG = 'gassar_idb_migrated_v1';

const memoryFallback = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let migrationPromise: Promise<void> | null = null;

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbGet(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read error'));
  });
}

async function idbSet(db: IDBDatabase, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('فشل حفظ البيانات في IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('تم إلغاء عملية الحفظ في IndexedDB'));
  });
}

async function idbRemove(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete error'));
  });
}

async function idbKeys(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve((req.result ?? []).map((k) => String(k)));
    req.onerror = () => reject(req.error ?? new Error('IndexedDB keys error'));
  });
}

async function ensureMigrated(db: IDBDatabase): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const migrated = await idbGet(db, MIGRATION_FLAG);
      if (migrated === 'true') return;
      const keys = Object.keys(window.localStorage);
      for (const key of keys) {
        if (
          key.startsWith('gassar_') ||
          key === 'activeModel' ||
          key === 'connectionMode' ||
          key === 'localModels'
        ) {
          const val = window.localStorage.getItem(key);
          if (val !== null) {
            const existing = await idbGet(db, key);
            if (existing === null) {
              await idbSet(db, key, val);
            }
          }
        }
      }
      await idbSet(db, MIGRATION_FLAG, 'true');
    } catch {
      // Keep running even if localStorage is restricted
    }
  })();
  return migrationPromise;
}

export const storage = {
  async getItem(key: string): Promise<string | null> {
    const db = await openDb();
    if (db) {
      await ensureMigrated(db);
      return idbGet(db, key);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memoryFallback.get(key) ?? null;
      }
    }
    return memoryFallback.get(key) ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const db = await openDb();
    if (db) {
      await ensureMigrated(db);
      await idbSet(db, key, value);
      return;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    memoryFallback.set(key, value);
  },

  async removeItem(key: string): Promise<void> {
    const db = await openDb();
    if (db) {
      await ensureMigrated(db);
      await idbRemove(db, key);
      return;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
    memoryFallback.delete(key);
  },

  async getAllKeys(): Promise<string[]> {
    const db = await openDb();
    if (db) {
      await ensureMigrated(db);
      return idbKeys(db);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      return Object.keys(window.localStorage);
    }
    return Array.from(memoryFallback.keys());
  },

  async multiGet(keys: readonly string[]): Promise<[string, string | null][]> {
    return Promise.all(keys.map(async (key) => [key, await storage.getItem(key)]));
  },

  async multiSet(entries: readonly [string, string][]): Promise<void> {
    await Promise.all(entries.map(([key, value]) => storage.setItem(key, value)));
  },
};
