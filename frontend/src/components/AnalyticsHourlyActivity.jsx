import { Clock } from 'lucide-react';
import AnalyticsChart from './AnalyticsChart.jsx';
import AnalyticsHeatmap from './AnalyticsHeatmap.jsx';
import { platforms } from '../utils/platformEntries.js';
import { hourlyActivityChartData } from '../utils/analyticsFormat.js';

const emptyReasons = {
  no_completed_shifts: 'Brak zakończonych i uzupełnionych zmian w tym okresie.',
  no_events: 'Brak zarejestrowanych dostaw w tym okresie.',
  overlapping_shifts: 'Zmiany z rejestracją nakładają się w czasie i zostały pominięte.',
  no_valid_events: 'Brak zarejestrowanych dostaw mieszczących się w czasie zmian.',
};
const number = value => Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 2 });

function ActivityResult({ activity }) {
  const rate = activity.mode === 'rate';
  const data = hourlyActivityChartData(activity);
  const hasValues = data.values.some(value => value !== null);
  const unit = rate ? 'dostawy/h' : 'zarejestrowane dostawy';
  const label = rate ? 'Dostawy na godzinę' : 'Liczba zarejestrowanych dostaw';
  const best = activity.bestIntervals;
  // Mapa cieplna dzień×godzina tylko przy wystarczającym pokryciu danych — inaczej prostszy widok godzinowy.
  if (activity.status === 'available' && activity.coverage?.sufficient) return <AnalyticsHeatmap activity={activity} />;
  return <>
    {rate && <div className="card analytics-best-weekday">
      <h3 className="analytics-chart-title flex items-center gap-2"><Clock size={18} aria-hidden="true" />Najaktywniejsza pora</h3>
      {best.status === 'available' ? <div className="analytics-best-result">
        <p>{best.keys.map(key => activity.groups.find(group => group.key === key).label).join(', ')}</p>
        <p className="analytics-best-rate">{number(best.registeredOrdersPerHour)} dostawy/h</p>
      </div> : <p className="muted text-sm">Brak danych</p>}
    </div>}
    <div className="card analytics-chart-card">
      <h3 className="analytics-chart-title">{label}</h3>
      {activity.status === 'no_data' ? <p className="muted py-4 text-sm">{emptyReasons[activity.emptyReason] ?? 'Brak danych godzinowych w tym okresie.'}</p>
        : hasValues ? <div className="analytics-hourly-chart" role="region" aria-label="Wykres godzin — przewijany poziomo" tabIndex={0}>
          <AnalyticsChart title={`Najlepsze godziny — ${label}, Europe/Warsaw`} type="bar" unit={unit} showAllLabels {...data} />
        </div>
        : <p className="muted py-4 text-sm">Brak danych</p>}
    </div>
  </>;
}

export default function AnalyticsHourlyActivity({ activity, status, message, eventPlatform, onEventPlatformChange, onRetry }) {
  return <section className="analytics-section" aria-labelledby="analytics-hourly-title">
    <h2 id="analytics-hourly-title" className="analytics-section-title">Godziny</h2>
    <div>
      <label htmlFor="analytics-event-platform" className="mb-2 block text-sm">Platforma zarejestrowanych dostaw</label>
      <select id="analytics-event-platform" className="form-input" value={eventPlatform} onChange={event => onEventPlatformChange(event.target.value)}>
        <option value="all">Wszystkie platformy</option>
        {platforms.map(platform => <option key={platform.value} value={platform.value}>{platform.label}</option>)}
      </select>
    </div>
    <p className="muted text-xs">Na podstawie ręcznie rejestrowanych dostaw. Nie potwierdza kompletności wszystkich dostaw.</p>
    {status === 'loading' && <p role="status">Wczytywanie danych godzinowych...</p>}
    {status === 'error' && <div>
      <p role="alert">{message}</p>
      <button type="button" className="button-secondary mt-2" onClick={onRetry}>Spróbuj ponownie</button>
    </div>}
    {status === 'success' && activity && <ActivityResult activity={activity} />}
  </section>;
}
