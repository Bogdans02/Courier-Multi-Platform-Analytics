import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { finishShift, getActiveShift, startShift } from '../services/api/shifts.js';
import { formatDateTime, formatDuration } from '../utils/shiftFormat.js';
import PlatformBadge from '../components/PlatformBadge.jsx';
import { Package, Play, Square } from 'lucide-react';

function timerText(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return [Math.floor(total / 3600), Math.floor(total % 3600 / 60), total % 60].map((part) => String(part).padStart(2, '0')).join(':');
}

export default function ActiveShift({ session, onSessionExpired }) {
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(Date.now);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    getActiveShift(session.token, controller.signal)
      .then(({ shift }) => { setShift(shift); setError(''); setLoading(false); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else { setError(error.message); setLoading(false); }
      });
    return () => controller.abort();
  }, [session.token, onSessionExpired, reload]);

  useEffect(() => {
    if (!shift) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [shift]);

  async function act() {
    setPending(true);
    setError('');
    try {
      if (shift) {
        const { shift: completed } = await finishShift(session.token, shift.id);
        navigate(`/shifts/${completed.id}`, { state: { summary: true } });
      } else {
        const { shift: active } = await startShift(session.token);
        setShift(active);
        setNow(Date.now());
      }
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      else {
        setError(error.message);
        // Reload the persisted state after a lost response or an already finished shift.
        setReload((value) => value + 1);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="page-heading"><h1>Zmiana</h1></div>
      {loading ? <p role="status">Wczytywanie zmiany...</p> : (
        <>
          <section className="timer-panel" aria-label="Stan zmiany">
            <p className={`timer-status ${shift ? 'is-active' : ''}`}><span className="status-dot" />{shift ? 'Aktywna zmiana' : 'Gotowy do pracy'}</p>
            <div className={`timer-ring ${shift ? 'running' : ''}`}>
              <p className="timer-value mt-2" role="timer" aria-label="Czas aktywnej zmiany">
                {timerText(shift ? (now - new Date(shift.startedAt).getTime()) / 1000 : 0)}
              </p>
              <p className="muted mt-2 text-sm">Czas pracy</p>
            </div>
            {shift && <p className="muted text-xs">Rozpoczęcie: {formatDateTime(shift.startedAt)}</p>}
          <button type="button" disabled={pending || !!error} onClick={act}
            className={`mt-6 w-full ${shift ? 'button-stop' : 'button-primary'}`}>
            {shift ? <Square size={22} strokeWidth={1.8} aria-hidden="true" /> : <Play size={22} strokeWidth={1.8} aria-hidden="true" />}
            {pending ? 'Proszę czekać...' : shift ? 'Zakończ zmianę' : 'Rozpocznij zmianę'}
          </button>
          </section>
          {shift && <section className="card space-y-4">
            <h2 className="font-semibold">Bieżąca zmiana</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div><dt className="muted text-xs">Status</dt><dd className="mt-1 text-emerald-300">Aktywna</dd></div>
              <div><dt className="muted text-xs">Czas pracy</dt><dd className="mt-1">{formatDuration((now - new Date(shift.startedAt).getTime()) / 1000)}</dd></div>
            </dl>
            <div className="shift-platform-note"><Package size={22} strokeWidth={1.8} aria-hidden="true" /><div><h3 className="mb-2 text-sm font-semibold">Platformy w tej zmianie</h3>
              {shift.platformEntries.length ? <div className="flex flex-wrap gap-2">{shift.platformEntries.map(({ platform }) => <PlatformBadge key={platform} platform={platform} />)}</div>
                : <p className="muted text-xs">Platformy i wyniki uzupełnisz po zakończeniu zmiany.</p>}
            </div></div>
          </section>}
        </>
      )}
      {error && <div><p role="alert" className="text-red-400">{error}</p>
        <button type="button" disabled={pending} onClick={() => { setLoading(true); setReload((value) => value + 1); }} className="py-2 underline">Spróbuj ponownie</button>
      </div>}
      <p className="text-center"><Link to="/history" className="text-link">Zobacz historię zmian →</Link></p>
    </>
  );
}
