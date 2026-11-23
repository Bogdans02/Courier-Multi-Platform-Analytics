import { useCallback, useEffect, useState } from 'react';
import { floatingTracking } from '../services/floatingTracking.js';

// Stan GPS kilometrażu podczas aktywnej zmiany. GPS to tylko domyślna wartość km —
// jeśli nie ma zgody, kurier wpisze dystans ręcznie w podsumowaniu zmiany.
export default function GpsTrackingStatus({ session, shiftId }) {
  // Poza Androidem nic nie sprawdzamy — od razu nie "loading", żeby efekt nie ustawiał stanu synchronicznie.
  const [state, setState] = useState(() => ({ granted: false, active: false, km: null, loading: floatingTracking.available }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [{ granted }, distance] = await Promise.all([
        floatingTracking.canUseLocation(), floatingTracking.getGpsDistance(session.user.id, shiftId),
      ]);
      setState({ granted, active: distance.active, km: distance.km, loading: false });
    } catch (error) { setError(error.message); setState((old) => ({ ...old, loading: false })); }
  }, [session.user.id, shiftId]);

  useEffect(() => {
    if (!floatingTracking.available) return undefined;
    let disposed = false;
    const run = () => { if (!disposed) refresh(); };
    run();
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', run);
    const timer = setInterval(() => { if (!document.hidden) run(); }, 3000);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', run);
    };
  }, [refresh]);

  // Po nadaniu zgody w ustawieniach Androida włączamy GPS dla trwającej już zmiany.
  async function enable() {
    setPending(true);
    setError('');
    try {
      await floatingTracking.startGps(session, shiftId);
      await refresh();
    } catch (error) { setError(error.message); }
    finally { setPending(false); }
  }

  if (!floatingTracking.available) return null;

  return <section className="card space-y-3">
    <h2 className="font-semibold">Kilometraż GPS</h2>
    <p className="muted text-sm" role="status">
      {state.loading ? 'Sprawdzanie GPS...'
        : state.active ? `Liczę dystans w tle${state.km ? `: ${Number(state.km).toLocaleString('pl-PL')} km` : ' — czekam na sygnał'}`
        : !state.granted ? 'Brak zgody na lokalizację. Dystans wpiszesz ręcznie w podsumowaniu.'
        : 'GPS wyłączony dla tej zmiany.'}
    </p>
    {!state.active && <button type="button" onClick={enable} disabled={pending || state.loading}
      className="button-secondary w-full">{pending ? 'Proszę czekać...' : 'Włącz liczenie kilometrów'}</button>}
    {error && <p role="alert" className="text-red-400">{error}</p>}
  </section>;
}
