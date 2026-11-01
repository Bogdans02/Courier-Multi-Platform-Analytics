import { useEffect, useState } from 'react';
import { floatingTracking } from '../services/floatingTracking.js';

export default function FloatingTrackingControl({ session, shiftId, disabled, onBusyChange }) {
  const [state, setState] = useState({ active: false, granted: false, loading: true });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const [permission, tracking] = await Promise.all([
          floatingTracking.canDrawOverlays(), floatingTracking.getTrackingState(session.user.id, shiftId),
        ]);
        if (!disposed) setState({ active: tracking.active, granted: permission.granted, loading: false,
          notificationsGranted: tracking.notificationsGranted });
      } catch (error) { if (!disposed) { setError(error.message); setState((old) => ({ ...old, loading: false })); } }
    }
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    // Native permission settings can return without a DOM focus event on some WebViews.
    const timer = floatingTracking.available ? setInterval(() => { if (!document.hidden) refresh(); }, 2000) : null;
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [session.user.id, shiftId]);

  async function toggle() {
    setPending(true);
    onBusyChange(true);
    setError('');
    try {
      if (state.active) {
        await floatingTracking.stopTracking();
        setState((old) => ({ ...old, active: false }));
      } else {
        const { granted } = await floatingTracking.canDrawOverlays();
        if (!granted) {
          await floatingTracking.requestOverlayPermission();
          setState((old) => ({ ...old, granted: false }));
        } else {
          const tracking = await floatingTracking.startTracking(session, shiftId);
          setState({ active: true, granted: true, loading: false, notificationsGranted: tracking.notificationsGranted });
        }
      }
    } catch (error) { setError(error.message); }
    finally { setPending(false); onBusyChange(false); }
  }

  return <section className="card space-y-3">
    <h2 className="font-semibold">Licznik zamówień</h2>
    <p className="muted text-sm" role="status">{!floatingTracking.available ? 'Dostępny w aplikacji Android. Zamówienia możesz wpisać w podsumowaniu.'
      : state.loading ? 'Sprawdzanie licznika...' : state.active ? 'Licznik aktywny' : !state.granted ? 'Brak zgody na wyświetlanie nad innymi aplikacjami.' : 'Licznik wyłączony'}</p>
    {floatingTracking.available && <button type="button" onClick={toggle} disabled={disabled || pending || state.loading}
      className="w-full rounded border border-slate-600 px-4 py-3 disabled:opacity-60">
      {pending ? 'Proszę czekać...' : state.active ? 'Wyłącz licznik zamówień' : 'Włącz licznik zamówień'}
    </button>}
    {state.active && state.notificationsGranted === false && <p className="muted text-sm">Powiadomienia są wyłączone w ustawieniach Androida. Licznik nadal działa.</p>}
    {error && <p role="alert" className="text-red-400">{error}</p>}
  </section>;
}
