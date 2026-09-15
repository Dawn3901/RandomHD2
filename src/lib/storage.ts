export function loadJson<T>(storage: Pick<Storage, "getItem">, key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(storage: Pick<Storage, "setItem">, key: string, value: T): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // 写入失败（配额超限、隐私模式等）不应让页面崩溃，本次变更只保留在内存里
  }
}

export function createMemoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));

  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}
