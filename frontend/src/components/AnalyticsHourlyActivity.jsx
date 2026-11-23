import AnalyticsHeatmap from './AnalyticsHeatmap.jsx';
import { platforms } from '../utils/platformEntries.js';

// Sekcja pokazuje mapę cieplną dzień×godzina tylko przy wystarczającym pokryciu danych.
// Zanim się uzbiera — jedna podpowiedź, bez uproszczonego wykresu, żeby nie sugerować wyniku z paru dostaw.
function ActivityResult({ activity }) {
  if (activity.status === 'available' && activity.coverage?.sufficient) return <AnalyticsHeatmap activity={activity} />;
  return <div className="card analytics-chart-card">
    <p className="muted py-4 text-sm">
      Na razie za mało danych, aby pokazać mapę godzin. Rejestruj dostawy w różne dni i godziny, a pojawi się tutaj.
    </p>
  </div>;
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
