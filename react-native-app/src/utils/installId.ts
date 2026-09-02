import AsyncStorage from '@react-native-async-storage/async-storage';
import { newClientId } from './clientId';

const INSTALL_ID_KEY = '@install_id';

/**
 * One id per installation, so "how many phones are on the old version" is a
 * question that can be answered.
 *
 * Not a device id, and deliberately not derivable from one: nothing here reads
 * an advertising id, an IMEI or a serial. It is a random string this app made
 * up about itself, stored in this app's own storage, and it dies with the
 * install - which is exactly the scope needed to count devices and app
 * versions, and no more.
 *
 * Same shape and same reasoning as a row's client id (see clientId.ts): a
 * millisecond timestamp plus 64 bits of randomness, no crypto source and no
 * dependency for a real uuid. It also stays inside the server's character set
 * for the column (letters, digits, dot, colon, dash, underscore).
 */

// Read once. The push builder asks for this on every sync, and a bridge
// round-trip per push for a value that cannot change is a waste of one.
let cached: string | null = null;

export const getInstallId = async (): Promise<string> => {
  if (cached) return cached;

  try {
    const stored = await AsyncStorage.getItem(INSTALL_ID_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch {
    // Storage unreadable. Fall through and mint one for this process rather
    // than failing the push it was needed for.
  }

  const fresh = newClientId();
  cached = fresh;
  // Not awaited into the return path: a device that cannot persist this still
  // reports consistently for the rest of the run, and the next launch simply
  // introduces itself as a new install. Losing a device row is a much smaller
  // cost than a sync that throws on its way to sending real training data.
  AsyncStorage.setItem(INSTALL_ID_KEY, fresh).catch(() => {});
  return fresh;
};
