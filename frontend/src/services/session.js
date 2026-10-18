import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { getCurrentUser } from './api/auth.js';

const TOKEN_KEY = 'courier_analytics_jwt';

// Dependencies can be replaced in tests without calling the native bridge.
export function createSessionService({ platform = Capacitor, storage = SecureStorage, getUser = getCurrentUser } = {}) {
  const native = platform.isNativePlatform() && platform.getPlatform() === 'android';

  async function clear() {
    if (!native) return;
    try {
      await storage.removeItem(TOKEN_KEY);
    } catch {
      throw new Error('Nie udało się usunąć zapisanej sesji. Ponów wylogowanie.');
    }
  }

  return {
    native,
    clear,
    async save(session) {
      if (native) {
        try {
          await storage.setItem(TOKEN_KEY, session.token);
        } catch {
          throw new Error('Nie udało się bezpiecznie zapisać sesji. Spróbuj zalogować się ponownie.');
        }
      }
      return session;
    },
    async restore(signal) {
      // Never invoke the plugin's unencrypted web implementation.
      if (!native) return null;
      let token;
      try {
        token = await storage.getItem(TOKEN_KEY);
      } catch {
        throw new Error('Nie udało się odczytać zapisanej sesji. Spróbuj ponownie lub wyloguj się.');
      }
      signal?.throwIfAborted();
      if (token === null) return null;
      try {
        const { user } = await getUser(token, signal);
        return { token, user };
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error.status !== 401) throw error;
        await clear();
        return null;
      }
    },
  };
}

export const sessionService = createSessionService();
