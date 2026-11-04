import { ChevronDown } from 'lucide-react';
import { platforms } from '../utils/platformEntries.js';
import { analyticsChartData } from '../utils/analyticsFormat.js';
import AnalyticsChart from './AnalyticsChart.jsx';
import AnalyticsDataTable from './AnalyticsDataTable.jsx';
import { DashboardDetails } from './DashboardSummary.jsx';

const views = [
  { key: 'trend', title: 'Trend dzienny', description: 'Według dnia rozpoczęcia zmiany w Polsce.' },
  { key: 'weekdays', title: 'Wyniki według dnia tygodnia', description: 'Cała zmiana należy do dnia jej rozpoczęcia w Polsce.' },
  { key: 'months', title: 'Porównanie miesięcy', description: 'Miesiące na granicach wybranego okresu mogą być niepełne.' },
  { key: 'startTimes', title: 'Czas rozpoczęcia zmian', description: 'Wyniki całych zmian według czasu rozpoczęcia w Polsce, nie zarobki uzyskane w tych godzinach. Start o 06:00 należy do 06:00–12:00.' },
  { key: 'platforms', title: 'Porównanie platform', description: 'Wszystkie platformy w wybranym okresie, niezależnie od filtra pozostałych zestawień.' },
];

export default function AnalyticsDetails({ summary, result, platform, onPlatformChange, tableKind, onTableKindChange, calendar }) {
  const view = views.find(item => item.key === tableKind);
  const details = result.status === 'success' ? result.details : null;
  const rows = details?.[tableKind];
  const moneyLabel = (details?.mode ?? summary?.mode) === 'estimated_net' ? 'Szacowane netto' : 'Brutto';
  const platformComparison = tableKind === 'platforms';
  const chartInMain = platformComparison || (tableKind === 'trend' && calendar !== 'all')
    || (tableKind === 'months' && calendar === 'all') || (tableKind === 'weekdays' && calendar !== 'week');
  const showChart = !platformComparison && (platform !== 'all' || !chartInMain);
  const chart = rows ? analyticsChartData(tableKind, rows) : null;
  return <details className="analytics-disclosure" id="detailed-analytics">
    <summary><h2>Szczegółowe dane</h2><ChevronDown className="disclosure-icon" size={20} aria-hidden="true" /></summary>
    <div className="analytics-disclosure-content">
      {summary ? <DashboardDetails summary={summary} /> : <p className="muted text-sm">Dodatkowe wskaźniki są chwilowo niedostępne.</p>}
      <div className="analytics-details-controls">
        <div>
          <label htmlFor="analytics-table-kind" className="mb-2 block text-sm">Zestawienie</label>
          <select id="analytics-table-kind" value={tableKind} onChange={event => onTableKindChange(event.target.value)}>
            {views.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="analytics-platform" className="mb-2 block text-sm">Platforma w zestawieniu</label>
          <select id="analytics-platform" value={platformComparison ? 'all' : platform} disabled={platformComparison}
            onChange={event => onPlatformChange(event.target.value)}>
            <option value="all">Wszystkie platformy</option>
            {platforms.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </div>
      <p className="muted text-xs">{moneyLabel} · wybrany okres kalendarzowy. Filtr dotyczy tylko zestawienia poniżej; dodatkowe wskaźniki pozostają globalne.</p>
      <p className="muted text-xs">{view.description}</p>
      {!platformComparison && platform !== 'all' && <p className="muted text-xs">Kwoty i zamówienia wybranej platformy, bez przypisywania jej czasu pracy ani wskaźników godzinowych.</p>}
      {result.status === 'loading' && <p role="status">Wczytywanie szczegółowych danych...</p>}
      {result.status === 'error' && <div>
        <p role="alert">{result.message}</p>
        <button type="button" className="py-2 underline" onClick={result.retry}>Spróbuj ponownie</button>
      </div>}
      {details && <>
        {rows.length > 0 && !rows.some(row => row.shiftCount > 0) && <p className="muted text-sm">Brak uzupełnionych zmian w wybranym zestawieniu.</p>}
        {showChart && chart.values.some(value => value !== null) && <section className="card analytics-chart-card">
          <h3 className="analytics-chart-title">{view.title} — zarobki</h3>
          <AnalyticsChart title={`${view.title} — ${moneyLabel.toLocaleLowerCase('pl-PL')} w PLN`}
            type={tableKind === 'trend' ? 'line' : 'bar'} {...chart} />
        </section>}
        {!showChart && <p className="muted text-xs">Wykres jest dostępny w sekcji {platformComparison ? 'Platformy' : 'Efektywność pracy'}. Poniżej komplet danych.</p>}
        <AnalyticsDataTable title={view.title} kind={tableKind} rows={rows} mode={details.mode}
          platform={platformComparison ? 'all' : platform} />
      </>}
    </div>
  </details>;
}
