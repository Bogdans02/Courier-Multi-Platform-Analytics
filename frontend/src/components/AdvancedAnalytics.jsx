import { useEffect, useState } from 'react';
import { getDetails } from '../services/api/analytics.js';
import { platforms } from '../utils/platformEntries.js';
import { analyticsLabel, analyticsChartData } from '../utils/analyticsFormat.js';
import { formatMoney } from '../utils/shiftFormat.js';
import AnalyticsChart from './AnalyticsChart.jsx';

function money(value) {
  return value === null ? 'Brak danych' : formatMoney(value);
}

function share(value) {
  return value === null ? 'Brak danych' : `${Number(value).toLocaleString('pl-PL')}%`;
}

function ResultGroup({ title, kind, rows, description, showHourly }) {
  const chart = analyticsChartData(kind, rows);
  return (
    <section className="min-w-0 space-y-3 rounded border border-slate-300 bg-white p-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-slate-600">{description}</p>
      {rows.some((row) => row.shiftCount > 0)
        ? <AnalyticsChart title={`${title} — zarobek brutto w PLN`} type={kind === 'trend' ? 'line' : 'bar'} {...chart} />
        : <p>Brak danych w wybranym okresie.</p>}
      <details>
        <summary className="cursor-pointer py-2 underline">Pokaż wartości: {title.toLowerCase()}</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title} — wartości liczbowe</caption>
            <thead><tr>
              <th scope="col" className="p-2">Grupa</th>
              <th scope="col" className="p-2">Zmiany</th>
              <th scope="col" className="p-2">Brutto</th>
              <th scope="col" className="p-2">Zamówienia</th>
              <th scope="col" className="p-2">Zł/zamówienie</th>
              {showHourly && <th scope="col" className="p-2">Zł/h</th>}
              {kind === 'platforms' && <>
                <th scope="col" className="p-2">Udział zarobków</th>
                <th scope="col" className="p-2">Udział zamówień</th>
              </>}
            </tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.key ?? row.platform} className="border-t border-slate-200">
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

export default function AdvancedAnalytics({ token, period, onSessionExpired }) {
  const [platform, setPlatform] = useState('all');
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ key: '', status: 'loading', details: null, message: '' });
  const key = `${period}/${platform}/${reload}`;
  const current = result.key === key ? result : { status: 'loading' };

  useEffect(() => {
    const controller = new AbortController();
    getDetails(token, period, platform, controller.signal)
      .then(({ details }) => {
        if (!controller.signal.aborted) setResult({ key, status: 'success', details, message: '' });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setResult({ key, status: 'error', details: null, message: error.message });
      });
    return () => controller.abort();
  }, [token, period, platform, key, onSessionExpired]);

  const details = current.details;
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="advanced-title">
      <h2 id="advanced-title" className="text-xl font-semibold">Rozszerzona analityka</h2>
      <label htmlFor="analytics-platform" className="block">Platforma na wykresach czasowych</label>
      <select id="analytics-platform" value={platform} onChange={(event) => setPlatform(event.target.value)}
        className="w-full rounded border border-slate-400 bg-white p-3">
        <option value="all">Wszystkie platformy</option>
        {platforms.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>
      <p className="text-sm text-slate-600">
        Wykresy korzystają z okresu wybranego powyżej. Cała zmiana należy do dnia, miesiąca i przedziału
        jej rozpoczęcia w strefie Europe/Warsaw. Grupy rozpoczęcia pokazują wyniki całych zmian,
        a nie zarobki uzyskane w poszczególnych godzinach.
        Filtr platformy obejmuje tylko jej zarobki i zamówienia; nie przypisuje jej czasu ani dystansu.
        Karty podsumowania powyżej zawsze obejmują wszystkie platformy.
      </p>
      {current.status === 'loading' && <p role="status">Wczytywanie wykresów...</p>}
      {current.status === 'error' && <div>
        <p role="alert" className="text-red-700">{current.message}</p>
        <button type="button" className="py-2 underline" onClick={() => setReload((value) => value + 1)}>
          Spróbuj ponownie
        </button>
      </div>}
      {details && <>
        {details.incompleteShiftCount > 0 && <p role="status">
          Pominięto zmiany bez uzupełnionych platform: {details.incompleteShiftCount}.
        </p>}
        {details.shiftCount === 0 && <p>Brak uzupełnionych zmian dla wybranej platformy i okresu.</p>}
        <ResultGroup title="Dzienny trend zarobków" kind="trend" rows={details.trend}
          description="Suma brutto według dnia rozpoczęcia. Dni bez uzupełnionych zmian nie są pokazane." />
        <ResultGroup title="Wyniki według dnia tygodnia" kind="weekdays" rows={details.weekdays}
          showHourly={platform === 'all'} description={platform === 'all'
            ? 'Wartości z całych zmian; zł/h to iloraz sumy zarobków i czasu pracy.'
            : 'Zarobki i zamówienia wybranej platformy według dnia rozpoczęcia zmiany.'} />
        <ResultGroup title="Porównanie miesięcy" kind="months" rows={details.months}
          showHourly={platform === 'all'}
          description="Miesiące kalendarzowe. Bieżący miesiąc i miesiące przycięte filtrem okresu są niepełne; porównuj także liczbę zmian i zł/h, gdy dostępne." />
        <ResultGroup title="Czas rozpoczęcia zmiany" kind="startTimes" rows={details.startTimes}
          showHourly={platform === 'all'} description="Przedziały obejmują początek i nie obejmują końca, np. 06:00 należy do 06:00–12:00." />
        <ResultGroup title="Porównanie platform" kind="platforms" rows={details.platforms}
          description="Wszystkie platformy z wybranego okresu, niezależnie od filtra wykresów czasowych. Udziały liczone względem ich łącznych zarobków i zamówień. Liczba zmian obejmuje każdą zmianę, w której użyto danej platformy." />
      </>}
    </section>
  );
}
