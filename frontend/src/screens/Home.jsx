import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getSummary, getDetails } from '../services/api/analytics.js';
import { getShifts, getActiveShift } from '../services/api/shifts.js';
import { getSettings } from '../services/api/settings.js';
import { formatCompactDuration, formatDistance, formatMoney } from '../utils/shiftFormat.js';
import { todaySummary, todayEarningsFromTrend } from '../utils/todaySummary.js';
import { hourlyRate } from '../utils/historySummary.js';
import { formatDay } from '../utils/dateFormat.js';
import useEarningsMode from '../hooks/useEarningsMode.js';
import { weekChartData } from '../utils/weekChart.js';
import AnalyticsChart from '../components/AnalyticsChart.jsx';
import ShiftCard from '../components/ShiftCard.jsx';
import ActiveShiftTimer from '../components/ActiveShiftTimer.jsx';
import IncompleteShiftsNotice from '../components/IncompleteShiftsNotice.jsx';
import DailyGoalProgress from '../components/DailyGoalProgress.jsx';
import { ChevronRight, Clock, Package, Play, Route, Wallet } from 'lucide-react';

export default function Home({ session, onSessionExpired }) {
  const { mode, settingsError } = useEarningsMode(session.token, onSessionExpired);
  const [result, setResult] = useState({ status: 'loading' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (mode === null) return;
    const controller = new AbortController();
    Promise.all([getSummary(session.token, 'current_week', controller.signal, mode),
      getDetails(session.token, 'current_week', 'all', controller.signal, mode),
      getShifts(session.token, controller.signal), getActiveShift(session.token, controller.signal),
      getSettings(session.token, controller.signal)])
      .then(([{ summary }, { details }, { shifts }, { shift }, { settings }]) => {
        if (!controller.signal.aborted) setResult({ status: 'success', summary, details, shifts, active: shift, settings });
      }).catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setResult({ status: 'error', message: error.message });
      });
    return () => controller.abort();
  }, [session.token, onSessionExpired, reload, mode]);

  const today = result.shifts ? todaySummary(result.shifts) : null;
  const week = result.status === 'success' ? weekChartData(result.details.trend, result.summary.from) : null;
  const moneyLabel = mode === 'estimated_net' ? 'Szacowane netto' : 'Brutto';
  // Stawka tygodnia liczona uczciwie: zarobek tygodnia / godziny tygodnia (jak w Historii).
  const weekRate = result.status === 'success' ? hourlyRate(result.summary.totalEarnings, result.summary.totalHours * 3600) : null;
  const weekHasData = week?.values.some((value) => value !== null);
  const todayEarnings = today && formatMoney(todayEarningsFromTrend(result.details.trend));

  return <>
    <div className="page-heading home-heading">
      <div><h1>Dziś</h1><p className="page-subtitle">{formatDay(new Date())}</p></div>
    </div>
    {settingsError && <p role="status" className="text-sm text-amber-300">Nie udało się odczytać ustawień netto. Wyświetlamy brutto. Otwórz ekran ponownie, aby spróbować jeszcze raz.</p>}
    {result.status === 'loading' && <p role="status">Wczytywanie podsumowania...</p>}
    {result.status === 'error' && <div className="card space-y-3">
      <p role="alert">{result.message}</p>
      <button type="button" className="button-secondary" onClick={() => { setResult({ status: 'loading' }); setReload((value) => value + 1); }}>Spróbuj ponownie</button>
    </div>}
    {result.status === 'success' && <>
      {/* Główna akcja dnia jest na górze: trwająca zmiana albo start nowej. */}
      {result.active
        ? <ActiveShiftTimer startedAt={result.active.startedAt} />
        : <Link to="/shifts/active" className="button-primary shift-cta"><span className="cta-icon"><Play size={22} strokeWidth={1.8} fill="currentColor" aria-hidden="true" /></span>Rozpocznij zmianę<ChevronRight size={22} strokeWidth={1.8} className="cta-arrow" aria-hidden="true" /></Link>}

      <section className="card week-card" aria-labelledby="week-title">
        <div className="section-heading week-heading"><h2 id="week-title"><span>Zarobek na godzinę w tym tygodniu</span><span className="week-range">{week.range}</span></h2><span className="mode-badge">{moneyLabel}</span></div>
        {weekHasData ? <>
          <p className="week-total">{weekRate === null ? '—' : `${formatMoney(weekRate)}/h`}</p>
          <p className="week-subtotal">{formatMoney(result.summary.totalEarnings)} · {result.summary.totalHours.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} h</p>
          <AnalyticsChart compact title={`Zarobek — ${moneyLabel.toLowerCase()}, ${week.range}, poniedziałek–niedziela`} type="bar" labels={week.labels} values={week.values} />
        </> : <p className="week-empty">Ten tydzień jeszcze bez uzupełnionych zmian. Zacznij zmianę, a wynik pojawi się tutaj.</p>}
        <Link to="/dashboard" className="card-footer-link">Zobacz analizę zarobków <ChevronRight size={22} strokeWidth={1.8} aria-hidden="true" /></Link>
      </section>

      <IncompleteShiftsNotice count={result.summary.incompleteShiftCount} description="Nie są uwzględniane w zarobkach tygodnia." />

      {/* "Dzisiaj" pokazujemy tylko, gdy dziś były uzupełnione zmiany — inaczej byłby rząd zer. */}
      {today && today.totalOrders + Number(today.durationSeconds) > 0 && <section className="card today-summary" aria-labelledby="today-title">
        <h2 id="today-title" className="card-title">Dzisiaj · {moneyLabel.toLowerCase()}</h2>
        <dl className="today-stats">
          <div><dt><Wallet size={18} strokeWidth={1.8} aria-hidden="true" />Zarobek</dt><dd>{todayEarnings}</dd></div>
          <div><dt><Package size={18} strokeWidth={1.8} aria-hidden="true" />Zamówienia</dt><dd>{today.totalOrders}</dd></div>
          <div><dt><Clock size={18} strokeWidth={1.8} aria-hidden="true" />Czas pracy</dt><dd>{formatCompactDuration(today.durationSeconds)}</dd></div>
          <div><dt><Route size={18} strokeWidth={1.8} aria-hidden="true" />Dystans</dt><dd>{formatDistance(today.distanceKm)}</dd></div>
        </dl>
        <DailyGoalProgress earnings={todayEarningsFromTrend(result.details.trend)} goal={result.settings.dailyGoal} />
      </section>}
      {today && today.incompleteCount > 0 && <p role="status">Zmiany z dzisiaj do uzupełnienia: {today.incompleteCount}. <Link to="/history" className="text-link">Otwórz historię</Link></p>}

      <section className="space-y-3" aria-labelledby="recent-title">
        <div className="section-heading"><h2 id="recent-title">Ostatnie zmiany</h2><Link to="/history" className="text-link">Zobacz wszystkie</Link></div>
        {result.shifts.length ? result.shifts.slice(0, 3).map((shift) => <ShiftCard key={shift.id} shift={shift} mode={mode} showRate />)
          : <p className="empty-state">Twoje zapisane zmiany pojawią się tutaj.</p>}
      </section>
    </>}
  </>;
}
