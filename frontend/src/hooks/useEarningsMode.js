import { useEffect, useState } from 'react';
import { getSettings } from '../services/api/settings.js';
import { defaultEarningsMode } from '../utils/earningsMode.js';

// Decide once on entry. Data refreshes and manual choices do not reinitialise it.
export default function useEarningsMode(token, onSessionExpired) {
  const [mode, setMode] = useState(null);
  const [settingsError, setSettingsError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getSettings(token, controller.signal).then(({ settings }) => {
      if (controller.signal.aborted) return;
      setMode((selected) => selected ?? defaultEarningsMode(settings));
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error.status === 401) onSessionExpired();
      else {
        setSettingsError(true);
        setMode((selected) => selected ?? 'gross');
      }
    });
    return () => controller.abort();
  }, [token, onSessionExpired]);

  return { mode, setMode, settingsError };
}
