import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import ShiftForm from '../components/ShiftForm.jsx';
import ShiftPlatformSummary from '../components/ShiftPlatformSummary.jsx';
import { deleteShift, getShift, updateShift } from '../services/api/shifts.js';
import { formatDateTime, formatDistance, formatDuration } from '../utils/shiftFormat.js';

export default function ShiftDetails({ session, onSessionExpired }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(!!location.state?.summary);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getShift(session.token, id, controller.signal)
      .then(({ shift }) => { setShift(shift); setError(''); setLoading(false); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else { setError(error.message); setLoading(false); }
      });
    return () => controller.abort();
  }, [session.token, id, onSessionExpired, reload]);

  async function save(values) {
    try {
      await updateShift(session.token, shift.id, values);
      navigate('/history', { state: { message: 'Zmiana została zapisana.' } });
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      throw error;
    }
  }

  async function remove() {
    setPending(true);
    setError('');
    try {
      await deleteShift(session.token, shift.id);
      navigate('/history', { state: { message: 'Zmiana została usunięta.' } });
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      else setError(error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">{location.state?.summary ? 'Podsumowanie zmiany' : 'Szczegóły zmiany'}</h1>
      {loading && <p role="status">Wczytywanie zmiany...</p>}
      {error && <div><p role="alert" className="text-red-700">{error}</p>
        {!shift && <button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1); }} className="py-2 underline">Spróbuj ponownie</button>}
      </div>}
      {!loading && shift && (
        <>
          <dl className="space-y-2 rounded border border-slate-300 bg-white p-4">
            <div><dt className="font-medium">Rozpoczęcie</dt><dd>{formatDateTime(shift.startedAt)}</dd></div>
            <div><dt className="font-medium">Zakończenie</dt><dd>{shift.endedAt ? formatDateTime(shift.endedAt) : 'Zmiana trwa'}</dd></div>
            <div><dt className="font-medium">Czas pracy</dt><dd>{shift.durationSeconds === null ? 'Zmiana trwa' : formatDuration(shift.durationSeconds)}</dd></div>
            <div><dt className="font-medium">Dystans</dt><dd>{formatDistance(shift.distanceKm)}</dd></div>
          </dl>
          {shift.status === 'completed' && <ShiftPlatformSummary shift={shift} />}
          {editing && shift.status === 'completed' ? (
            <ShiftForm key={shift.id} shift={shift} onSubmit={save} onCancel={() => setEditing(false)} />
          ) : (
            <div className="flex flex-wrap gap-3">
              {shift.status === 'completed' && <button type="button" disabled={pending || confirmDelete} onClick={() => setEditing(true)} className="rounded border border-slate-400 px-4 py-3">Edytuj zmianę</button>}
              {shift.status === 'active' && <Link to="/shifts/active" className="py-3 underline">Przejdź do aktywnej zmiany</Link>}
              {!confirmDelete && <button type="button" onClick={() => setConfirmDelete(true)} className="rounded border border-red-700 px-4 py-3 text-red-700">Usuń zmianę</button>}
            </div>
          )}
          {confirmDelete && <div className="space-y-3 rounded border border-red-700 p-4">
            <p>Czy na pewno chcesz usunąć tę zmianę? Tej operacji nie można cofnąć.</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={pending} onClick={remove} className="rounded bg-red-700 px-4 py-3 text-white disabled:opacity-60">{pending ? 'Usuwanie...' : 'Potwierdź usunięcie'}</button>
              <button type="button" disabled={pending} onClick={() => setConfirmDelete(false)} className="rounded border border-slate-400 px-4 py-3">Anuluj usuwanie</button>
            </div>
          </div>}
        </>
      )}
      <p><Link to="/history" className="underline">Wróć do historii</Link></p>
    </>
  );
}
