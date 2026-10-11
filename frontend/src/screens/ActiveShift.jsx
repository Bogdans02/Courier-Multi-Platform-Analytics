import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { finishShift, getActiveShift, startShift } from '../services/api/shifts.js';
import { formatDateTime, formatDuration } from '../utils/shiftFormat.js';

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
      <h1 className="text-2xl font-semibold">Zmiana robocza</h1>
      {loading ? <p role="status">Wczytywanie zmiany...</p> : (
        <>
          {shift ? (
            <div className="space-y-2 rounded border border-slate-300 bg-white p-4">
              <p>Zmiana trwa od: <strong>{formatDateTime(shift.startedAt)}</strong></p>
              <p>Czas pracy: <strong>{formatDuration((now - new Date(shift.startedAt).getTime()) / 1000)}</strong></p>
            </div>
          ) : <p>Nie masz aktywnej zmiany.</p>}
          <button type="button" disabled={pending || !!error} onClick={act}
            className="w-full max-w-md rounded bg-slate-800 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {pending ? 'Proszę czekać...' : shift ? 'Zakończ zmianę' : 'Rozpocznij zmianę'}
          </button>
        </>
      )}
      {error && <div><p role="alert" className="text-red-700">{error}</p>
        <button type="button" disabled={pending} onClick={() => { setLoading(true); setReload((value) => value + 1); }} className="py-2 underline">Spróbuj ponownie</button>
      </div>}
      <p><Link to="/history" className="underline">Historia zmian</Link></p>
    </>
  );
}
