import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CANONICAL_DATA_VERSION,
  CANONICAL_VERSION_KEY,
  APP_STORAGE_KEYS,
  STORAGE_KEY_PREFIX,
} from '@/constants/canonicalData';

async function clearAppStorageKeys(): Promise<void> {
  console.log('[CanonicalBootstrap] Clearing app storage keys...');
  try {
    await AsyncStorage.multiRemove([...APP_STORAGE_KEYS]);
    console.log('[CanonicalBootstrap] Cleared primary keys');
  } catch (e) {
    console.warn('[CanonicalBootstrap] multiRemove failed, falling back to individual removes:', e);
    for (const key of APP_STORAGE_KEYS) {
      try {
        await AsyncStorage.removeItem(key);
      } catch { /* ignore */ }
    }
  }

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const prefixedKeys = allKeys.filter((k) => k.startsWith(`${STORAGE_KEY_PREFIX}:`));
    if (prefixedKeys.length > 0) {
      await AsyncStorage.multiRemove(prefixedKeys);
      console.log('[CanonicalBootstrap] Cleared', prefixedKeys.length, 'prefixed keys');
    }
  } catch (e) {
    console.warn('[CanonicalBootstrap] Failed to clear prefixed keys:', e);
  }
}

export async function checkAndSeedCanonicalData(): Promise<boolean> {
  try {
    const storedVersion = await AsyncStorage.getItem(CANONICAL_VERSION_KEY);
    console.log('[CanonicalBootstrap] Stored version:', storedVersion, '| Expected:', CANONICAL_DATA_VERSION);

    if (storedVersion === CANONICAL_DATA_VERSION) {
      console.log('[CanonicalBootstrap] Versions match — no reset needed');
      return false;
    }

    console.log('[CanonicalBootstrap] Version mismatch — clearing and re-seeding...');
    await clearAppStorageKeys();
    await AsyncStorage.setItem(CANONICAL_VERSION_KEY, CANONICAL_DATA_VERSION);
    console.log('[CanonicalBootstrap] ✅ Storage cleared, version set to', CANONICAL_DATA_VERSION);
    return true;
  } catch (e) {
    console.error('[CanonicalBootstrap] Bootstrap error (non-fatal):', e);
    return false;
  }
}

export async function resetToCanonicalData(): Promise<boolean> {
  try {
    console.log('[CanonicalBootstrap] Manual reset to canonical data requested');
    await clearAppStorageKeys();
    await AsyncStorage.setItem(CANONICAL_VERSION_KEY, CANONICAL_DATA_VERSION);
    console.log('[CanonicalBootstrap] ✅ Manual reset complete');
    return true;
  } catch (e) {
    console.error('[CanonicalBootstrap] Manual reset error:', e);
    return false;
  }
}
