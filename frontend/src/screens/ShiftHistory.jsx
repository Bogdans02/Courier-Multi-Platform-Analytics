import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { getShifts } from '../services/api/shifts.js';
import ShiftCard from '../components/ShiftCard.jsx';

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
      <div className="page-heading"><h1>Historia</h1></div>
      {location.state?.message && <p role="status">{location.state.message}</p>}
      <div className="section-heading"><p className="muted text-sm">Zapisane zmiany{!loading && !error ? `: ${shifts.length}` : ''}</p><Link to="/shifts/active" className="text-link">Twoja zmiana →</Link></div>
      {loading && <p role="status">Wczytywanie historii...</p>}
      {error && <div><p role="alert" className="text-red-400">{error}</p>
        <button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1); }} className="py-2 underline">Spróbuj ponownie</button>
      </div>}
      {!loading && !error && (shifts.length === 0 ? <p className="empty-state">Nie masz jeszcze zakończonych zmian.</p> : (
        <ul className="space-y-3">
          {shifts.map((shift, index) => {
            const month = new Date(shift.startedAt).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
            const previous = index > 0 ? new Date(shifts[index - 1].startedAt).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }) : null;
            return <li key={shift.id}>{month !== previous && <h2 className="history-month">{month}</h2>}<ShiftCard shift={shift} /></li>;
          })}
        </ul>
      ))}
    </>
  );
}
