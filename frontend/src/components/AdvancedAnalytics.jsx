import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import useAnalyticsDetails from '../hooks/useAnalyticsDetails.js';
import { platforms } from '../utils/platformEntries.js';
import { analyticsChartData } from '../utils/analyticsFormat.js';
import { formatMoney } from '../utils/shiftFormat.js';
import AnalyticsChart from './AnalyticsChart.jsx';
import AnalyticsEfficiency from './AnalyticsEfficiency.jsx';
import AnalyticsPlatforms from './AnalyticsPlatforms.jsx';
import AnalyticsHourlyActivity from './AnalyticsHourlyActivity.jsx';
import AnalyticsDataTable from './AnalyticsDataTable.jsx';
import { DashboardDetails } from './DashboardSummary.jsx';
import IncompleteShiftsNotice from './IncompleteShiftsNotice.jsx';

const tableViews = [['trend', 'Trend dzienny'], ['weekdays', 'Dni tygodnia'], ['months', 'Miesiące'],
  ['startTimes', 'Czas rozpoczęcia'], ['platforms', 'Platformy']];
const money = (value) => value === null ? 'Brak danych' : formatMoney(value);

function ResultChart({ title, kind, rows, description, mode }) {
  const chart = analyticsChartData(kind, rows);
  const moneyLabel = mode === 'estimated_net' ? 'Szacowane netto' : 'Brutto';
  return <section className="card analytics-chart-card">
    <h3 className="analytics-chart-title">{title}</h3>
    {rows.some((row) => row.shiftCount > 0)
      ? <AnalyticsChart title={`${title} — ${moneyLabel.toLowerCase()} w PLN`} type={kind === 'trend' ? 'line' : 'bar'} {...chart} />
      : <p className="muted py-4 text-sm">Brak danych w wybranym okresie.</p>}
    {description && <p className="muted text-xs">{description}</p>}
  </section>;
}

export default function AdvancedAnalytics({ token, selection, mode = 'gross', onSessionExpired, summary, showIncompleteWarning = true }) {
  const [platform, setPlatform] = useState('all');
  const [tableKind, setTableKind] = useState('trend');
  const [metricKey, setMetricKey] = useState('totalEarnings');
  const [platformMetric, setPlatformMetric] = useState('earnings');
  const [eventPlatform, setEventPlatform] = useState('all');
  const calendar = selection?.kind;
  const asOf = selection?.asOf;
  const global = useAnalyticsDetails({ token, selection, mode, platform: 'all', onSessionExpired });
  const filtered = useAnalyticsDetails({ token, selection, mode, platform, onSessionExpired,
    enabled: platform !== 'all' && global.status === 'success' });
  const hourlyFiltered = useAnalyticsDetails({ token, selection, mode, platform: 'all', eventPlatform, onSessionExpired,
    enabled: eventPlatform !== 'all' && global.status === 'success' });
  const current = platform === 'all' || global.status !== 'success' ? global : filtered;
  const hourly = eventPlatform === 'all' || global.status !== 'success' ? global : hourlyFiltered;

  if (!calendar || !asOf) return null;
  const details = current.details;
  return <>
    {details && showIncompleteWarning && <IncompleteShiftsNotice count={details.incompleteShiftCount} />}
    <section className="analytics-section" aria-labelledby="analytics-trends-title">
      <h2 id="analytics-trends-title" className="analytics-section-title">Efektywność pracy</h2>
      {global.status === 'loading' && <p role="status">Wczytywanie wykresów...</p>}
      {global.status === 'error' && <div>
        <p role="alert">{global.message}</p>
        <button type="button" className="py-2 underline" onClick={global.retry}>Spróbuj ponownie</button>
      </div>}
      {global.details && <AnalyticsEfficiency details={global.details} selection={selection}
        availableRange={summary?.availableRange} metricKey={metricKey} onMetricChange={setMetricKey} />}
    </section>
    {global.details && <AnalyticsPlatforms rows={global.details.platforms} mode={global.details.mode}
      metricKey={platformMetric} onMetricChange={setPlatformMetric} />}
    <AnalyticsHourlyActivity activity={hourly.details?.hourlyActivity} status={hourly.status} message={hourly.message}
      eventPlatform={eventPlatform} onEventPlatformChange={setEventPlatform} onRetry={hourly.retry} />
    {(details || summary) && <>
      <details className="analytics-disclosure" id="additional-analytics">
        <summary><h2>Pozostałe analizy</h2><ChevronDown className="disclosure-icon" size={20} aria-hidden="true" /></summary>
        <div className="analytics-disclosure-content">
          {summary ? <DashboardDetails summary={summary} /> : <p className="muted text-sm">Wskaźniki podsumowania są chwilowo niedostępne.</p>}
          <div className="analytics-chart-filter">
            <label htmlFor="analytics-platform" className="mb-2 block">Platforma w analizach szczegółowych</label>
            <select id="analytics-platform" value={platform} onChange={event => setPlatform(event.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-900 p-3">
              <option value="all">Wszystkie platformy</option>
              {platforms.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {platform !== 'all' && global.status === 'success' && current.status === 'error' && <div>
            <p role="alert">{current.message}</p>
            <button type="button" className="py-2 underline" onClick={current.retry}>Spróbuj ponownie</button>
          </div>}
          {details ? <>
          {details.shiftCount === 0 && <p className="muted text-sm">Brak uzupełnionych zmian dla wybranej platformy i okresu.</p>}
          <ResultChart title="Porównanie miesięcy" kind="months" rows={details.months} mode={details.mode}
            description="Bieżący miesiąc i miesiące na granicach wybranego okresu mogą być niepełne." />
          <ResultChart title="Czas rozpoczęcia zmiany" kind="startTimes" rows={details.startTimes} mode={details.mode}
            description="Wyniki całych zmian według przedziału rozpoczęcia w Polsce, nie zarobki uzyskane w tych godzinach. Start o 06:00 należy do 06:00–12:00." />
          </> : <p className="muted text-sm">{current.status === 'loading' ? 'Wczytywanie wykresów...' : 'Wykresy są niedostępne. Ponów odczyt powyżej.'}</p>}
        </div>
      </details>
      <details className="analytics-disclosure" id="detailed-analytics">
        <summary><h2>Szczegółowe dane</h2><ChevronDown className="disclosure-icon" size={20} aria-hidden="true" /></summary>
        <div className="analytics-disclosure-content">
          {summary && <dl className="analytics-order-average">
            <dt className="muted text-xs">Średni zarobek na zamówienie · wszystkie platformy</dt>
            <dd className="mt-1 font-semibold">{money(summary.earningsPerOrder)}</dd>
          </dl>}
          {details ? <><div>
            <label htmlFor="analytics-table-kind" className="mb-2 block">Zestawienie</label>
            <select id="analytics-table-kind" value={tableKind} onChange={(event) => setTableKind(event.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-900 p-3">
              {tableViews.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <AnalyticsDataTable title={tableViews.find(([value]) => value === tableKind)[1]} kind={tableKind}
            rows={details[tableKind]} mode={details.mode} platform={platform} />
          </> : <p className="muted text-sm">{current.status === 'loading' ? 'Wczytywanie tabeli...' : 'Tabela jest niedostępna. Ponów odczyt powyżej.'}</p>}
        </div>
      </details>
    </>}
  </>;
}
