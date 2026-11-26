export const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage quota errors cleanly
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  },
  async getAllKeys(): Promise<string[]> {
    try {
      return Object.keys(window.localStorage);
    } catch {
      return [];
    }
  },
  async multiGet(keys: readonly string[]): Promise<[string, string | null][]> {
    return Promise.all(keys.map(async (key) => [key, await storage.getItem(key)]));
  },
  async multiSet(entries: readonly [string, string][]): Promise<void> {
    await Promise.all(entries.map(([key, value]) => storage.setItem(key, value)));
  },
};
