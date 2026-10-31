import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getSummary } from '../services/api/analytics.js';
import DashboardSummary from '../components/DashboardSummary.jsx';
import IncompleteShiftsNotice from '../components/IncompleteShiftsNotice.jsx';
import AdvancedAnalytics from '../components/AdvancedAnalytics.jsx';
import { formatRate } from '../utils/netSettings.js';
import useEarningsMode from '../hooks/useEarningsMode.js';
import { Info } from 'lucide-react';

export default function Dashboard({ session, onSessionExpired }) {
  const [period, setPeriod] = useState('week');
  const { mode, setMode, settingsError } = useEarningsMode(session.token, onSessionExpired);
  const [statistics, setStatistics] = useState({ status: 'loading', summary: null, message: '' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (mode === null) return;
    const controller = new AbortController();
    getSummary(session.token, period, controller.signal, mode)
      .then(({ summary }) => {
        if (!controller.signal.aborted) setStatistics({ status: 'success', summary, message: '' });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setStatistics({ status: 'error', summary: null, message: error.message });
      });
    return () => controller.abort();
  }, [session.token, period, mode, reload, onSessionExpired]);

  return (
    <>
      <div className="page-heading"><h1>Analiza</h1></div>
      <div className="analytics-filters space-y-3">
      <div className="segmented period-tabs" role="group" aria-label="Okres statystyk">
        {[['week', 'Tydzień'], ['month', 'Miesiąc'], ['three_months', '3 mies.'], ['all', 'Całość']].map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => {
          if (period === value) return;
          setStatistics({ status: 'loading', summary: null, message: '' });
          setPeriod(value);
        }}>{label}</button>)}
      </div>
      {mode !== null && <div className="segmented" role="group" aria-label="Wartości finansowe">
        {[['estimated_net', 'Szacowane netto'], ['gross', 'Brutto']].map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => {
          if (mode === value) return;
          setStatistics({ status: 'loading', summary: null, message: '' });
          setMode(value);
        }}>{label}</button>)}
      </div>}
      {settingsError && <p role="status" className="text-sm text-amber-300">Nie udało się odczytać ustawień netto. Początkowo wybrano brutto. Możesz zmienić tryb przełącznikiem lub otworzyć ekran ponownie.</p>}
      {mode === 'estimated_net' && statistics.summary?.deductionRate != null && <div className="card estimated-net-note flex items-start gap-3">
        <Info size={20} strokeWidth={1.8} className="mt-0.5 shrink-0 text-sky-300" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sky-300">Szacowane netto · {formatRate(statistics.summary.deductionRate)}</p>
          <p className="muted mt-1 text-xs">Szacunek na podstawie aktualnego profilu. Nie stanowi rozliczenia podatkowego.</p>
          <Link to="/settings" className="text-link inline-flex min-h-8 items-center">Ustawienia szacowanego netto →</Link>
        </div>
      </div>}
      {statistics.status === 'success' && <IncompleteShiftsNotice count={statistics.summary.incompleteShiftCount} />}
      </div>
      {statistics.status === 'loading' && <p role="status">Wczytywanie statystyk...</p>}
      {statistics.status === 'error' && <div>
        <p role="alert" className="text-red-400">{statistics.message}</p>
        {mode === 'estimated_net' && <Link to="/settings" className="text-link">Ustaw profil szacowanego netto</Link>}
        <button type="button" className="py-2 underline" onClick={() => {
          setStatistics({ status: 'loading', summary: null, message: '' });
          setReload((value) => value + 1);
        }}>Spróbuj ponownie</button>
      </div>}
      {statistics.status === 'success' && <DashboardSummary summary={statistics.summary} />}
      {mode !== null && <AdvancedAnalytics token={session.token} period={period} mode={mode} onSessionExpired={onSessionExpired}
        summary={statistics.summary} showIncompleteWarning={statistics.status !== 'success'} />}
    </>
  );
}
