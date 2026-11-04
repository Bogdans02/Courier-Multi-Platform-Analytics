import { useEffect, useState } from 'react';
import { getDetails } from '../services/api/analytics.js';

export default function useAnalyticsDetails({ token, selection, mode, platform, eventPlatform, onSessionExpired, enabled = true }) {
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ key: '', status: 'loading' });
  const calendar = selection?.kind;
  const anchor = selection?.anchor;
  const asOf = selection?.asOf;
  const key = JSON.stringify([token, calendar, anchor, asOf, platform, eventPlatform, mode, reload]);
  useEffect(() => {
    if (!enabled || !calendar || !asOf) return;
    const controller = new AbortController();
    getDetails(token, { calendar, anchor, asOf }, platform, controller.signal, mode, eventPlatform)
      .then(({ details }) => {
        if (!controller.signal.aborted) setResult({ key, status: 'success', details });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setResult({ key, status: 'error', message: error.message });
      });
    return () => controller.abort();
  }, [token, calendar, anchor, asOf, platform, eventPlatform, mode, enabled, key, onSessionExpired]);
  return { ...(result.key === key ? result : { status: 'loading' }), retry: () => setReload(value => value + 1) };
}
