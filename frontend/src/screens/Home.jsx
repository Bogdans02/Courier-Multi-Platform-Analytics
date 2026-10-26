import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getSummary, getDetails } from '../services/api/analytics.js';
import { getShifts, getActiveShift } from '../services/api/shifts.js';
import { formatCompactDuration, formatDistance, formatMoney } from '../utils/shiftFormat.js';
import { todaySummary, todayEarningsFromTrend } from '../utils/todaySummary.js';
import useEarningsMode from '../hooks/useEarningsMode.js';
import { weekChartData } from '../utils/weekChart.js';
import AnalyticsChart from '../components/AnalyticsChart.jsx';
import ShiftCard from '../components/ShiftCard.jsx';
import IncompleteShiftsNotice from '../components/IncompleteShiftsNotice.jsx';
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
      getShifts(session.token, controller.signal), getActiveShift(session.token, controller.signal)])
      .then(([{ summary }, { details }, { shifts }, { shift }]) => {
        if (!controller.signal.aborted) setResult({ status: 'success', summary, details, shifts, active: shift });
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
  const metrics = today ? [
    [mode === 'estimated_net' ? 'Dzisiaj · szac. netto' : 'Dzisiaj · brutto',
      formatMoney(todayEarningsFromTrend(result.details.trend)), Wallet, moneyLabel],
    ['Zamówienia', today.totalOrders, Package, 'dzisiaj'],
    ['Czas pracy', formatCompactDuration(today.durationSeconds), Clock, 'zapisany czas pracy'],
    ['Dystans', formatDistance(today.distanceKm), Route, 'podany w zmianach'],
  ] : [];
  return <>
    <div className="page-heading home-heading">
      <div><h1>Start</h1><p className="page-subtitle">{new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    </div>
    {settingsError && <p role="status" className="text-sm text-amber-300">Nie udało się odczytać ustawień netto. Wyświetlamy brutto. Otwórz ekran ponownie, aby spróbować jeszcze raz.</p>}
    {result.status === 'loading' && <p role="status">Wczytywanie podsumowania...</p>}
    {result.status === 'error' && <div className="card space-y-3">
      <p role="alert">{result.message}</p>
      <button type="button" onClick={() => { setResult({ status: 'loading' }); setReload((value) => value + 1); }}>Spróbuj ponownie</button>
    </div>}
    {result.status === 'success' && <>
      <section className="card week-card" aria-labelledby="week-title">
        <div className="section-heading week-heading"><h2 id="week-title"><span>Zarobek w tym tygodniu</span><span className="week-range">{week.range}</span></h2><span className="mode-badge">{moneyLabel}</span></div>
        <p className="week-total">{formatMoney(result.summary.totalEarnings)}</p>
        <AnalyticsChart compact title={`Zarobek — ${moneyLabel.toLowerCase()}, ${week.range}, poniedziałek–niedziela`} type="bar" labels={week.labels} values={week.values} />
        <Link to="/dashboard" className="card-footer-link">Zobacz analizę zarobków <ChevronRight size={22} strokeWidth={1.8} aria-hidden="true" /></Link>
      </section>
      <IncompleteShiftsNotice count={result.summary.incompleteShiftCount} description="Nie są uwzględniane w zarobkach tygodnia." />
      <section aria-labelledby="today-title" className="space-y-3">
        <h2 id="today-title" className="sr-only">Dzisiejsze zakończone i uzupełnione zmiany</h2>
        <dl className="metric-grid today-grid">{metrics.map(([label, value, MetricIcon, hint]) => <div className="card metric-card" key={label}>
          <dt><span>{label}</span><span className="metric-icon"><MetricIcon size={22} strokeWidth={1.8} aria-hidden="true" /></span></dt><dd>{value}</dd><p className="sr-only">{hint}</p>
        </div>)}</dl>
        {today.incompleteCount > 0 && <p role="status">Zmiany z dzisiaj do uzupełnienia: {today.incompleteCount}. <Link to="/history" className="text-link">Otwórz historię</Link></p>}
      </section>
      <Link to="/shifts/active" className="button-primary shift-cta"><span className="cta-icon">{result.active
        ? <Clock size={22} strokeWidth={1.8} aria-hidden="true" />
        : <Play size={22} strokeWidth={1.8} fill="currentColor" aria-hidden="true" />}</span>{result.active ? 'Wróć do aktywnej zmiany' : 'Rozpocznij zmianę'}<ChevronRight size={22} strokeWidth={1.8} className="cta-arrow" aria-hidden="true" /></Link>
      <section className="space-y-3" aria-labelledby="recent-title">
        <div className="section-heading"><h2 id="recent-title">Ostatnie zmiany</h2><Link to="/history" className="text-link">Zobacz wszystkie</Link></div>
        {result.shifts.length ? result.shifts.slice(0, 3).map((shift) => <ShiftCard key={shift.id} shift={shift} mode={mode} />)
          : <p className="empty-state">Twoje zapisane zmiany pojawią się tutaj.</p>}
      </section>
    </>}
  </>;
}
