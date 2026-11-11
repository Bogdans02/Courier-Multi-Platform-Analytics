import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getShifts } from '../services/api/shifts.js';
import ShiftCard from '../components/ShiftCard.jsx';
import { adjacentCalendarAnchor, calendarPeriodLabel } from '../utils/analyticsCalendar.js';
import { filterShifts, monthOf, monthSummary, platformsUsed, shiftCountLabel } from '../utils/historySummary.js';
import { formatMoney } from '../utils/shiftFormat.js';

export default function ShiftHistory({ session, onSessionExpired }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('all');
  const [params, setParams] = useSearchParams();
  const location = useLocation();

  // Wybrany miesiąc jest w adresie (?month=2026-10), więc powrót "wstecz" go pamięta.
  const current = monthOf(new Date());
  const fromUrl = params.get('month');
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(fromUrl ?? '') && `${fromUrl}-01` <= current ? `${fromUrl}-01` : current;

  // Serwer zwraca tylko zmiany z wybranego miesiąca.
  useEffect(() => {
    const controller = new AbortController();
    getShifts(session.token, controller.signal, month.slice(0, 7))
      .then(({ shifts }) => { setShifts(shifts); setError(''); setLoading(false); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else { setError(error.message); setLoading(false); }
      });
    return () => controller.abort();
  }, [session.token, onSessionExpired, reload, month]);

  const summary = monthSummary(shifts);
  const visible = filterShifts(shifts, filter);
  const chips = [['all', 'Wszystkie'],
    ...(summary.incompleteCount ? [['incomplete', `Do uzupełnienia (${summary.incompleteCount})`]] : []),
    ...platformsUsed(shifts).map(({ value, label }) => [value, label])];
  const platformFilter = chips.find(([value]) => value === filter && value !== 'all' && value !== 'incomplete');

  function changeMonth(direction) {
    setLoading(true);
    setError('');
    setParams({ month: adjacentCalendarAnchor('month', month, direction).slice(0, 7) }, { replace: true });
    setFilter('all');
  }

  return (
    <>
      <div className="page-heading"><h1>Historia</h1></div>
      {location.state?.message && <p role="status">{location.state.message}</p>}
      <div className="month-navigation">
        <button type="button" aria-label="Poprzedni miesiąc" disabled={loading}
          onClick={() => changeMonth(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
        <p className="month-navigation-label" aria-live="polite">{calendarPeriodLabel('month', month)}</p>
        <button type="button" aria-label="Następny miesiąc" disabled={loading || month >= current}
          onClick={() => changeMonth(1)}><ChevronRight size={20} aria-hidden="true" /></button>
      </div>
      {loading && <p role="status">Wczytywanie historii...</p>}
      {error && <div><p role="alert" className="text-red-400">{error}</p>
        <button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1); }} className="button-secondary mt-2">Spróbuj ponownie</button>
      </div>}
      {!loading && !error && (shifts.length === 0 ? <p className="empty-state">Brak zmian w tym miesiącu.</p> : <>
        <section className="card history-summary" aria-label="Podsumowanie miesiąca">
          <dl>
            <div><dt>Zarobek</dt><dd>{formatMoney(summary.earnings)}</dd></div>
            <div><dt>Czas pracy</dt><dd>{summary.hours.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} h</dd></div>
            <div><dt>Na godzinę</dt><dd className="history-summary-rate">{summary.rate === null ? '—' : `${formatMoney(summary.rate)}/h`}</dd></div>
          </dl>
          <p className="muted text-xs">{shiftCountLabel(summary.completeCount)} · {summary.label}</p>
        </section>
        <div className="filter-chips" role="group" aria-label="Filtr zmian">
          {chips.map(([value, label]) => <button key={value} type="button" className="filter-chip"
            aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        {/* Czasu zmiany nie da się uczciwie podzielić między platformy, więc podsumowanie zostaje dla całego miesiąca. */}
        {platformFilter && <p className="muted text-xs">{shiftCountLabel(visible.length)} z {platformFilter[1]} · podsumowanie dotyczy całego miesiąca.</p>}
        <ul className="space-y-3">
          {visible.map((shift) => <li key={shift.id}><ShiftCard shift={shift} showRate showCompleteAction /></li>)}
        </ul>
      </>)}
    </>
  );
}
