import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * OFFLINE CACHE
 * - Stores last successful screen payload for offline fallback.
 * - TTL is intentionally short to avoid very stale operational data.
 */
const keyOf = (namespace: string, uid?: string | null) => `afetyardim:cache:${namespace}:${uid || "anon"}`;
const TTL_MS = 1000 * 60 * 30; // 30 min

type CacheEnvelope<T> = {
  data: T;
  savedAt: number;
};

export const saveOfflineCache = async <T>(namespace: string, uid: string | undefined | null, data: T): Promise<void> => {
  try {
    const body: CacheEnvelope<T> = { data, savedAt: Date.now() };
    await AsyncStorage.setItem(keyOf(namespace, uid), JSON.stringify(body));
  } catch {
    // best effort
  }
};

export const readOfflineCache = async <T>(namespace: string, uid: string | undefined | null): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(keyOf(namespace, uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > TTL_MS) return null;
    return (parsed?.data as T) || null;
  } catch {
    return null;
  }
};

