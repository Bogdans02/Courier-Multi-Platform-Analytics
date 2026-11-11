import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import ShiftForm from '../components/ShiftForm.jsx';
import ShiftPlatformSummary from '../components/ShiftPlatformSummary.jsx';
import ShiftCosts from '../components/ShiftCosts.jsx';
import { getShift, updateShift } from '../services/api/shifts.js';
import { getExpenses } from '../services/api/expenses.js';
import { formatCompactDuration, formatMoney, formatShiftDay, formatTimeRange } from '../utils/shiftFormat.js';
import { monthOf } from '../utils/historySummary.js';
import { shiftMetrics } from '../utils/shiftMetrics.js';
import { deleteShiftWithDraft, floatingTracking } from '../services/floatingTracking.js';
import { entriesFromOrderEvents, withOrderEvents } from '../utils/orderEvents.js';

// Link do Historii od razu na miesiąc tej zmiany.
const historyFor = (startedAt) => `/history?month=${monthOf(startedAt).slice(0, 7)}`;

export default function ShiftDetails({ session, onSessionExpired }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const summaryMode = !!location.state?.summary;
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(summaryMode);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState(null);
  const [costs, setCosts] = useState({ status: 'loading', expenses: [], message: '' });

  useEffect(() => {
    const controller = new AbortController();
    getShift(session.token, id, controller.signal)
      .then(async ({ shift }) => {
        const local = await floatingTracking.getTrackingState(session.user.id, shift.id);
        if (controller.signal.aborted) return;
        setDraft(local);
        setShift(shift); setError(''); setLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else { setError(error.message); setLoading(false); }
      });
    return () => controller.abort();
  }, [session.token, session.user.id, id, onSessionExpired, reload]);

  // Koszty przypisane do tej zmiany — osobne zapytanie, więc błąd kosztów nie ukrywa samej zmiany.
  useEffect(() => {
    const controller = new AbortController();
    getExpenses(session.token, { shiftId: id }, controller.signal)
      .then(({ expenses }) => setCosts({ status: 'success', expenses, message: '' }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setCosts({ status: 'error', expenses: [], message: error.message });
      });
    return () => controller.abort();
  }, [session.token, id, onSessionExpired]);

  async function save(values) {
    try {
      const { shift: saved } = await updateShift(session.token, shift.id, withOrderEvents(values, draft));
      await floatingTracking.clearTrackingDraft(session.user.id, shift.id);
      navigate(historyFor(saved.startedAt), { state: { message: 'Zmiana została zapisana.' } });
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      throw error;
    }
  }

  async function remove() {
    setPending(true);
    setError('');
    try {
      if (shift.status === 'active') await floatingTracking.stopTracking();
      await deleteShiftWithDraft(session, shift.id);
      navigate(historyFor(shift.startedAt), { state: { message: 'Zmiana została usunięta.' } });
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      else setError(error.message);
    } finally {
      setPending(false);
    }
  }

  const complete = shift?.status === 'completed' && shift.platformEntries.length > 0;
  const metrics = complete ? shiftMetrics(shift, costs.expenses) : null;
  // W podglądzie tytułem jest dzień zmiany; przy edycji dzień przechodzi do podtytułu.
  const editTitle = summaryMode ? 'Podsumowanie zmiany' : 'Edycja zmiany';
  const subtitle = shift && [...(editing ? [formatShiftDay(shift.startedAt)] : []), ...(shift.status === 'active'
    ? ['zmiana trwa']
    : [formatTimeRange(shift.startedAt, shift.endedAt), formatCompactDuration(shift.durationSeconds),
      shift.distanceKm === null ? 'bez dystansu' : `${Number(shift.distanceKm).toLocaleString('pl-PL')} km`])];

  return (
    <>
      <Link to={shift ? historyFor(shift.startedAt) : '/history'} className="back-link">
        <ChevronLeft size={20} aria-hidden="true" />Historia
      </Link>
      {loading && <p role="status">Wczytywanie zmiany...</p>}
      {error && <div><p role="alert">{error}</p>
        {!shift && <button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1); }} className="button-secondary mt-2">Spróbuj ponownie</button>}
      </div>}
      {!loading && shift && <>
        <div className="page-heading">
          <h1>{editing ? editTitle : formatShiftDay(shift.startedAt)}</h1>
          <p className="page-subtitle">{subtitle.join(' · ')}</p>
        </div>

        {editing && shift.status === 'completed' ? (
          // Edycja zastępuje podgląd, żeby te same dane nie były na ekranie dwa razy.
          <ShiftForm key={shift.id} shift={shift} initialEntries={!shift.platformEntries.length && draft?.hasDraft
            ? entriesFromOrderEvents(draft.orderEvents) : undefined} onSubmit={save} onCancel={() => setEditing(false)} />
        ) : <>
          {shift.status === 'active' && <section className="card space-y-3">
            <p>Ta zmiana jeszcze trwa. Zarobki uzupełnisz po jej zakończeniu.</p>
            <Link to="/shifts/active" className="button-primary w-full">Przejdź do aktywnej zmiany</Link>
          </section>}

          {shift.status === 'completed' && !complete && <section className="card shift-card-incomplete space-y-3">
            <p className="text-amber-300 font-semibold">Do uzupełnienia</p>
            <p className="muted text-sm">Wpisz zarobki i zamówienia z platform, żeby zobaczyć wynik zmiany.</p>
            <button type="button" onClick={() => setEditing(true)} className="button-primary w-full">Uzupełnij zarobki</button>
          </section>}

          {complete && <>
            <section className="card" aria-label="Wynik zmiany">
              <p className="muted text-sm">Zarobek · {metrics.label}</p>
              <p className="shift-result-amount earnings">{formatMoney(metrics.amount)}</p>
              <p className="muted text-sm">{shift.totalOrders} zam.</p>
              <dl className="metric-row">
                <div><dt>na godzinę</dt><dd className="accent-value">{metrics.perHour === null ? '—' : formatMoney(metrics.perHour)}</dd></div>
                <div><dt>na zamówienie</dt><dd>{metrics.perOrder === null ? '—' : formatMoney(metrics.perOrder)}</dd></div>
                <div><dt>na km</dt><dd>{metrics.perKm === null ? '—' : formatMoney(metrics.perKm)}</dd></div>
              </dl>
              {metrics.perKm === null && <p className="muted text-xs mt-2">Zł/km pojawi się po podaniu dystansu w edycji zmiany.</p>}
            </section>
            <ShiftPlatformSummary shift={shift} />
          </>}

          <ShiftCosts shiftId={shift.id} expenses={costs.expenses} status={costs.status} message={costs.message} metrics={metrics} />

          {complete && <button type="button" disabled={pending || confirmDelete} onClick={() => setEditing(true)} className="button-secondary w-full">Edytuj zmianę</button>}
          {!confirmDelete && <button type="button" onClick={() => setConfirmDelete(true)} className="button-danger w-full">Usuń zmianę</button>}
          {confirmDelete && <div className="space-y-3 rounded-ui border border-danger-line p-4">
            <p>Czy na pewno chcesz usunąć tę zmianę? Tej operacji nie można cofnąć. Koszty zostaną, ale bez przypisania do zmiany.</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={pending} onClick={remove} className="button-danger">{pending ? 'Usuwanie...' : 'Potwierdź usunięcie'}</button>
              <button type="button" disabled={pending} onClick={() => setConfirmDelete(false)} className="button-secondary">Anuluj</button>
            </div>
          </div>}
        </>}
      </>}
    </>
  );
}
