import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getDetails } from '../services/api/analytics.js';
import { platforms } from '../utils/platformEntries.js';
import { analyticsChartData } from '../utils/analyticsFormat.js';
import { formatMoney } from '../utils/shiftFormat.js';
import AnalyticsChart from './AnalyticsChart.jsx';
import AnalyticsDataTable from './AnalyticsDataTable.jsx';
import { DashboardDetails } from './DashboardSummary.jsx';
import PlatformBadge from './PlatformBadge.jsx';
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

export default function AdvancedAnalytics({ token, period, mode = 'gross', onSessionExpired, summary, showIncompleteWarning = true }) {
  const [platform, setPlatform] = useState('all');
  const [tableKind, setTableKind] = useState('trend');
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ key: '', status: 'loading', details: null, message: '' });
  const key = `${period}/${platform}/${mode}/${reload}`;
  const current = result.key === key ? result : { status: 'loading' };

  useEffect(() => {
    const controller = new AbortController();
    getDetails(token, period, platform, controller.signal, mode)
      .then(({ details }) => {
        if (!controller.signal.aborted) setResult({ key, status: 'success', details, message: '' });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setResult({ key, status: 'error', details: null, message: error.message });
      });
    return () => controller.abort();
  }, [token, period, platform, mode, key, onSessionExpired]);

  const details = current.details;
  return <>
    {details && showIncompleteWarning && <IncompleteShiftsNotice count={details.incompleteShiftCount} />}
    <section className="analytics-section" aria-labelledby="analytics-trends-title">
      <h2 id="analytics-trends-title" className="analytics-section-title">Trendy</h2>
      <div className="analytics-chart-filter">
        <label htmlFor="analytics-platform" className="mb-2 block">Platforma na wykresach czasowych</label>
        <select id="analytics-platform" value={platform} onChange={(event) => setPlatform(event.target.value)}
          className="w-full rounded border border-slate-600 bg-slate-900 p-3">
          <option value="all">Wszystkie platformy</option>
          {platforms.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {current.status === 'loading' && <p role="status">Wczytywanie wykresów...</p>}
      {current.status === 'error' && <div>
        <p role="alert">{current.message}</p>
        <button type="button" className="py-2 underline" onClick={() => setReload((value) => value + 1)}>Spróbuj ponownie</button>
      </div>}
      {details && <>
        {details.shiftCount === 0 && <p className="muted text-sm">Brak uzupełnionych zmian dla wybranej platformy i okresu.</p>}
        <ResultChart title="Dzienny trend zarobków" kind="trend" rows={details.trend} mode={details.mode}
          description="Według dnia rozpoczęcia zmiany w Polsce." />
        <ResultChart title="Wyniki według dnia tygodnia" kind="weekdays" rows={details.weekdays} mode={details.mode} />
      </>}
    </section>
    {details && <section className="analytics-section" aria-labelledby="analytics-platforms-title">
        <h2 id="analytics-platforms-title" className="analytics-section-title">Platformy</h2>
        <div className="card">
          <h3 className="analytics-chart-title">Zarobki i udział platform</h3>
          {details.platforms.length > 0 ? <div className="platform-shares" aria-label="Udział platform w zarobkach">
            {details.platforms.map((row) => <div key={row.platform}>
              <div className="platform-share-label"><PlatformBadge platform={row.platform} /><span className="platform-share-value">
                <span>{money(row.totalEarnings)}</span><small>{row.earningsShare === null ? 'Brak danych' : `${Number(row.earningsShare).toLocaleString('pl-PL')}%`}</small>
              </span></div>
              {row.earningsShare !== null && <div className="platform-share-track" aria-hidden="true"><div className={`platform-share-fill ${row.platform}`}
                style={{ width: `${Math.min(100, Math.max(0, Number(row.earningsShare)))}%` }} /></div>}
            </div>)}
          </div> : <p className="muted py-4 text-sm">Brak danych w wybranym okresie.</p>}
        </div>
      </section>}
    {(details || summary) && <>
      <details className="analytics-disclosure" id="additional-analytics">
        <summary><h2>Pozostałe analizy</h2><ChevronDown className="disclosure-icon" size={20} aria-hidden="true" /></summary>
        <div className="analytics-disclosure-content">
          {summary ? <DashboardDetails summary={summary} /> : <p className="muted text-sm">Wskaźniki podsumowania są chwilowo niedostępne.</p>}
          {details ? <>
          <ResultChart title="Porównanie miesięcy" kind="months" rows={details.months} mode={details.mode}
            description="Bieżący miesiąc i miesiące na granicach wybranego okresu mogą być niepełne." />
          <ResultChart title="Czas rozpoczęcia zmiany" kind="startTimes" rows={details.startTimes} mode={details.mode}
            description="Wyniki całych zmian według przedziału rozpoczęcia w Polsce, nie zarobki uzyskane w tych godzinach. Start o 06:00 należy do 06:00–12:00." />
          <ResultChart title="Wykres porównania kwot platform" kind="platforms" rows={details.platforms} mode={details.mode} />
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
