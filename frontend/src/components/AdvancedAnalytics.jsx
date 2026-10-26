import { useEffect, useState } from 'react';
import { getDetails } from '../services/api/analytics.js';
import { platforms } from '../utils/platformEntries.js';
import { analyticsLabel, analyticsChartData } from '../utils/analyticsFormat.js';
import { formatMoney } from '../utils/shiftFormat.js';
import AnalyticsChart from './AnalyticsChart.jsx';
import PlatformBadge from './PlatformBadge.jsx';
import IncompleteShiftsNotice from './IncompleteShiftsNotice.jsx';

function money(value) {
  return value === null ? 'Brak danych' : formatMoney(value);
}

function share(value) {
  return value === null ? 'Brak danych' : `${Number(value).toLocaleString('pl-PL')}%`;
}

function ResultGroup({ title, kind, rows, description, showHourly, mode }) {
  const chart = analyticsChartData(kind, rows);
  const moneyLabel = mode === 'estimated_net' ? 'Szacowane netto' : 'Brutto';
  return (
    <section className="min-w-0 space-y-3 card">
      <h3 className="text-lg font-semibold">{title}</h3>
      {kind === 'platforms' && rows.length > 0 && <div className="platform-shares" aria-label="Udział platform w zarobkach">
        {rows.map((row) => <div key={row.platform}>
          <div className="platform-share-label"><PlatformBadge platform={row.platform} /><span className="platform-share-value">{money(row.totalEarnings)}<small>{share(row.earningsShare)}</small></span></div>
          {row.earningsShare !== null && <div className="platform-share-track" aria-hidden="true"><div className={`platform-share-fill ${row.platform}`} style={{ width: `${Math.min(100, Math.max(0, Number(row.earningsShare)))}%` }} /></div>}
        </div>)}
      </div>}
      {rows.some((row) => row.shiftCount > 0)
        ? kind === 'platforms' ? <details><summary>Wykres porównania kwot</summary><AnalyticsChart title={`${title} — ${moneyLabel.toLowerCase()} w PLN`} {...chart} /></details>
          : <AnalyticsChart title={`${title} — ${moneyLabel.toLowerCase()} w PLN`} type={kind === 'trend' ? 'line' : 'bar'} {...chart} />
        : <p className="muted text-sm">Brak danych w wybranym okresie.</p>}
      {description && <p className="muted text-xs">{description}</p>}
      <details>
        <summary className="cursor-pointer py-2 underline">Tabela danych<span className="sr-only">: {title.toLowerCase()}</span></summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title} — wartości liczbowe</caption>
            <thead><tr>
              <th scope="col" className="p-2">Grupa</th>
              <th scope="col" className="p-2">Zmiany</th>
              <th scope="col" className="p-2">{moneyLabel}</th>
              <th scope="col" className="p-2">Zamówienia</th>
              <th scope="col" className="p-2">Zł/zamówienie</th>
              {showHourly && <th scope="col" className="p-2">Zł/h</th>}
              {kind === 'platforms' && <>
                <th scope="col" className="p-2">Udział zarobków</th>
                <th scope="col" className="p-2">Udział zamówień</th>
              </>}
            </tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.key ?? row.platform} className="border-t border-slate-700">
                <th scope="row" className="p-2 font-normal">{analyticsLabel(kind, row)}</th>
                <td className="p-2">{row.shiftCount}</td>
                <td className="whitespace-nowrap p-2">{row.shiftCount ? money(row.totalEarnings) : 'Brak danych'}</td>
                <td className="p-2">{row.shiftCount ? row.totalOrders : 'Brak danych'}</td>
                <td className="whitespace-nowrap p-2">{money(row.earningsPerOrder)}</td>
                {showHourly && <td className="whitespace-nowrap p-2">{money(row.earningsPerHour)}</td>}
                {kind === 'platforms' && <>
                  <td className="p-2">{share(row.earningsShare)}</td>
                  <td className="p-2">{share(row.ordersShare)}</td>
                </>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export default function AdvancedAnalytics({ token, period, mode = 'gross', onSessionExpired, showIncompleteWarning = true }) {
  const [platform, setPlatform] = useState('all');
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
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="advanced-title">
      <h2 id="advanced-title" className="sr-only">Trendy i porównania</h2>
      <div className="analytics-chart-filter space-y-2">
      <label htmlFor="analytics-platform" className="block">Platforma na wykresach czasowych</label>
      <select id="analytics-platform" value={platform} onChange={(event) => setPlatform(event.target.value)}
        className="w-full rounded border border-slate-600 bg-slate-900 p-3">
        <option value="all">Wszystkie platformy</option>
        {platforms.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>
      {platform !== 'all' && <p className="muted text-xs">Dla platformy pokazujemy zarobki i zamówienia, bez czasu i dystansu.</p>}
      </div>
      {current.status === 'loading' && <p role="status">Wczytywanie wykresów...</p>}
      {current.status === 'error' && <div>
        <p role="alert" className="text-red-400">{current.message}</p>
        <button type="button" className="py-2 underline" onClick={() => setReload((value) => value + 1)}>
          Spróbuj ponownie
        </button>
      </div>}
      {details && <>
        {showIncompleteWarning && <IncompleteShiftsNotice count={details.incompleteShiftCount} />}
        {details.shiftCount === 0 && <p>Brak uzupełnionych zmian dla wybranej platformy i okresu.</p>}
        <ResultGroup title="Dzienny trend zarobków" kind="trend" rows={details.trend} mode={details.mode}
          description="Według dnia rozpoczęcia zmiany w Polsce." />
        <ResultGroup title="Zarobki i udział platform" kind="platforms" rows={details.platforms} mode={details.mode}
          description="Wszystkie platformy, niezależnie od filtra. Ta sama zmiana może obejmować kilka platform." />
        <ResultGroup title="Wyniki według dnia tygodnia" kind="weekdays" rows={details.weekdays} mode={details.mode}
          showHourly={platform === 'all'} />
        <details className="card"><summary>Miesiące i czas rozpoczęcia</summary><div className="space-y-4 pt-3">
        <ResultGroup title="Porównanie miesięcy" kind="months" rows={details.months} mode={details.mode}
          showHourly={platform === 'all'}
          description="Bieżący miesiąc i miesiące na granicach wybranego okresu mogą być niepełne." />
        <ResultGroup title="Czas rozpoczęcia zmiany" kind="startTimes" rows={details.startTimes} mode={details.mode}
          showHourly={platform === 'all'} description="Wyniki całych zmian według godziny rozpoczęcia w Polsce, nie zarobki w danej godzinie. Start o 06:00 należy do 06:00–12:00." />
        </div></details>
      </>}
    </section>
  );
}
