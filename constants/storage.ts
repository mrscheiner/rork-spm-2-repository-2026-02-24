import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_PREFIX = 'seasonpass_v2' as const;

export type StorageKey = string;

export function k(key: StorageKey): `${typeof STORAGE_PREFIX}:${string}` {
  return `${STORAGE_PREFIX}:${key}`;
}

export async function resetAllData(): Promise<void> {
  console.log('[Storage] resetAllData called');
  const keys = await AsyncStorage.getAllKeys();
  const appKeys = keys.filter((key) => key.startsWith(`${STORAGE_PREFIX}:`));
  console.log('[Storage] resetAllData keys found:', keys.length, 'app keys:', appKeys.length);
  await AsyncStorage.multiRemove(appKeys);
  console.log('[Storage] resetAllData completed');
}
