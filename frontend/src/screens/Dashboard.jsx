import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getSummary } from '../services/api/analytics.js';
import DashboardSummary from '../components/DashboardSummary.jsx';
import IncompleteShiftsNotice from '../components/IncompleteShiftsNotice.jsx';
import AdvancedAnalytics from '../components/AdvancedAnalytics.jsx';
import AnalyticsPeriodSelector from '../components/AnalyticsPeriodSelector.jsx';
import { initialAnalyticsCalendar, selectAnalyticsCalendar, stepAnalyticsCalendar } from '../utils/analyticsCalendar.js';
import { formatRate } from '../utils/netSettings.js';
import useEarningsMode from '../hooks/useEarningsMode.js';
import { ChevronDown, Info, RefreshCw } from 'lucide-react';

export default function Dashboard({ session, onSessionExpired }) {
  const [calendarSelection, setCalendarSelection] = useState(initialAnalyticsCalendar);
  const { mode, setMode, settingsError } = useEarningsMode(session.token, onSessionExpired);
  const [result, setResult] = useState({ key: '', status: 'loading', summary: null, message: '' });
  const [navigation, setNavigation] = useState(null);
  const [reload, setReload] = useState(0);
  const calendar = calendarSelection.kind;
  const anchor = calendar === 'all' ? undefined : calendarSelection.anchors[calendar];
  // Every global read gets a new version, including a quick A -> B -> A switch.
  const key = JSON.stringify([session.token, calendar, anchor, mode, reload]);
  const statistics = result.key === key ? result : { status: 'loading', summary: null };
  const availableRange = navigation?.token === session.token ? navigation.range : null;

  useEffect(() => {
    if (mode === null) return;
    const controller = new AbortController();
    getSummary(session.token, { calendar, anchor }, controller.signal, mode)
      .then(({ summary }) => {
        if (controller.signal.aborted) return;
        setNavigation({ token: session.token, range: summary.availableRange });
        setResult({ key, status: 'success', summary, message: '' });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setResult({ key, status: 'error', summary: null, message: error.message });
      });
    return () => controller.abort();
  }, [session.token, calendar, anchor, mode, key, onSessionExpired]);

  return (
    <>
      <div className="page-heading flex items-center justify-between gap-3"><h1>Analiza</h1>
        <button type="button" className="analytics-refresh" disabled={mode === null || statistics.status === 'loading'}
          onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Odśwież</button>
      </div>
      <div className="analytics-filters space-y-3">
      <AnalyticsPeriodSelector selection={calendarSelection} range={availableRange}
        confirmedAnchor={statistics.summary?.selection.anchor}
        onKindChange={kind => {
          if (kind === calendar) return;
          setCalendarSelection(state => selectAnalyticsCalendar(state, kind,
            availableRange?.currentDate ?? initialAnalyticsCalendar().anchors.week));
          setReload(value => value + 1);
        }}
        onAnchorChange={value => {
          setCalendarSelection(state => ({ ...state, anchors: { ...state.anchors, [state.kind]: value } }));
          setReload(value => value + 1);
        }}
        onStep={direction => {
          setCalendarSelection(state => stepAnalyticsCalendar(state, direction, availableRange));
          setReload(value => value + 1);
        }} />
      {mode !== null && <div className="segmented" role="group" aria-label="Wartości finansowe">
        {[['estimated_net', 'Szacowane netto'], ['gross', 'Brutto']].map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => {
          if (mode === value) return;
          setMode(value);
          setReload(value => value + 1);
        }}>{label}</button>)}
      </div>}
      {settingsError && <p role="status" className="text-sm text-amber-300">Nie udało się odczytać ustawień netto. Początkowo wybrano brutto. Możesz zmienić tryb przełącznikiem lub otworzyć ekran ponownie.</p>}
      {mode === 'estimated_net' && statistics.summary?.deductionRate != null && <details className="card estimated-net-note notice-disclosure">
        <summary className="text-sky-300">
          <Info size={20} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
          <span>Szacowane netto · {formatRate(statistics.summary.deductionRate)}</span>
          <ChevronDown size={16} className="notice-chevron shrink-0" aria-hidden="true" />
        </summary>
        <div className="notice-description">
          <p className="muted text-xs">Szacunek na podstawie aktualnego profilu. Nie stanowi rozliczenia podatkowego.</p>
          <Link to="/settings" className="text-link inline-flex min-h-8 items-center">Ustawienia szacowanego netto →</Link>
        </div>
      </details>}
      {statistics.status === 'success' && <IncompleteShiftsNotice count={statistics.summary.incompleteShiftCount} />}
      </div>
      {statistics.status === 'loading' && <p role="status">Wczytywanie statystyk...</p>}
      {statistics.status === 'error' && <div>
        <p role="alert" className="text-red-400">{statistics.message}</p>
        {mode === 'estimated_net' && <Link to="/settings" className="text-link">Ustaw profil szacowanego netto</Link>}
        <button type="button" className="button-secondary mt-2" onClick={() => {
          setReload((value) => value + 1);
        }}>Spróbuj ponownie</button>
      </div>}
      {statistics.status === 'success' && <DashboardSummary summary={statistics.summary} />}
      {mode !== null && <AdvancedAnalytics token={session.token} selection={statistics.summary?.selection} mode={mode} onSessionExpired={onSessionExpired}
        summary={statistics.summary} showIncompleteWarning={statistics.status !== 'success'} />}
    </>
  );
}
