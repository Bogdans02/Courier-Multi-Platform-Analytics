import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { getShifts } from '../services/api/shifts.js';
import ShiftPlatformSummary from '../components/ShiftPlatformSummary.jsx';
import { formatDateTime, formatDistance, formatDuration } from '../utils/shiftFormat.js';

export default function ShiftHistory({ session, onSessionExpired }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const location = useLocation();

  useEffect(() => {
    const controller = new AbortController();
    getShifts(session.token, controller.signal)
      .then(({ shifts }) => { setShifts(shifts); setError(''); setLoading(false); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else { setError(error.message); setLoading(false); }
      });
    return () => controller.abort();
  }, [session.token, onSessionExpired, reload]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Historia zmian</h1>
      {location.state?.message && <p role="status">{location.state.message}</p>}
      <p><Link to="/shifts/active" className="underline">Przejdź do zmiany roboczej</Link></p>
      {loading && <p role="status">Wczytywanie historii...</p>}
      {error && <div><p role="alert" className="text-red-700">{error}</p>
        <button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1); }} className="py-2 underline">Spróbuj ponownie</button>
      </div>}
      {!loading && !error && (shifts.length === 0 ? <p>Nie masz jeszcze zakończonych zmian.</p> : (
        <ul className="space-y-3">
          {shifts.map((shift) => (
            <li key={shift.id} className="space-y-1 rounded border border-slate-300 bg-white p-4">
              <p>Rozpoczęcie: {formatDateTime(shift.startedAt)}</p>
              <p>Zakończenie: {formatDateTime(shift.endedAt)}</p>
              <p>Czas pracy: {formatDuration(shift.durationSeconds)}</p>
              <p>Dystans: {formatDistance(shift.distanceKm)}</p>
              <ShiftPlatformSummary shift={shift} />
              <Link to={`/shifts/${shift.id}`} className="inline-block py-2 underline">Szczegóły zmiany</Link>
            </li>
          ))}
        </ul>
      ))}
    </>
  );
}
