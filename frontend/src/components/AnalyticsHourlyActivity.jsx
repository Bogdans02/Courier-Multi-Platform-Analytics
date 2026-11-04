import { ChevronDown, Clock, Info } from 'lucide-react';
import AnalyticsChart from './AnalyticsChart.jsx';
import { platforms } from '../utils/platformEntries.js';
import { hourlyActivityChartData } from '../utils/analyticsFormat.js';

const emptyReasons = {
  no_completed_shifts: 'Brak zakończonych i uzupełnionych zmian w tym okresie.',
  no_events: 'Brak zarejestrowanych dostaw w tym okresie.',
  overlapping_shifts: 'Zmiany z rejestracją nakładają się w czasie i zostały pominięte w tej analizie.',
  no_valid_events: 'Brak zarejestrowanych dostaw mieszczących się w czasie zmian.',
};
const number = value => Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 2 });

function ActivityResult({ activity }) {
  const rate = activity.mode === 'rate';
  const data = hourlyActivityChartData(activity);
  const hasValues = data.values.some(value => value !== null);
  const unit = rate ? 'dostawy/h' : 'zarejestrowane dostawy';
  const label = rate ? 'Dostawy/h' : 'Zamówienia — liczba zarejestrowanych dostaw';
  const best = activity.bestIntervals;
  return <>
    {rate && <div className="card analytics-best-weekday">
      <h3 className="analytics-chart-title flex items-center gap-2"><Clock size={18} aria-hidden="true" />Najaktywniejsza pora</h3>
      {best.status === 'available' ? <div className="analytics-best-result">
        <p>{best.keys.map(key => activity.groups.find(group => group.key === key).label).join(', ')}</p>
        <p className="analytics-best-rate">{number(best.registeredOrdersPerHour)} dostawy/h</p>
      </div> : <p className="muted text-sm">{best.status === 'all_zero' ? 'Brak wyróżniającej się pory' : 'Brak danych do porównania przedziałów'}</p>}
    </div>}
    <div className="card analytics-chart-card">
      <h3 className="analytics-chart-title">{label}</h3>
      {activity.status === 'no_data' ? <p className="muted py-4 text-sm">{emptyReasons[activity.emptyReason] ?? 'Brak danych godzinowych w tym okresie.'}</p>
        : hasValues ? <>
          <div className="analytics-hourly-chart" role="region" aria-label="Wykres godzin — przewijany poziomo" tabIndex={0}>
            <AnalyticsChart title={`Najlepsze godziny — ${label}, Europe/Warsaw`} type="bar" unit={unit} showAllLabels {...data} />
          </div>
          {!rate && !data.values.some(value => value > 0) && <p className="muted text-xs">W dostępnej próbie nie zarejestrowano dostaw tej platformy.</p>}
        </> : <p className="muted py-4 text-sm">Brak obliczalnego wyniku dla wybranego trybu.</p>}
      <details className="analytics-hourly-values">
        <summary>Przedziały i wartości <ChevronDown size={16} aria-hidden="true" /></summary>
        <table className="w-full text-sm">
          <caption className="sr-only">{label} w dwugodzinnych przedziałach</caption>
          <thead><tr><th scope="col">Przedział</th><th scope="col">{label}</th></tr></thead>
          <tbody>{activity.groups.map((group, index) => <tr key={group.key}>
            <th scope="row">{group.label}</th><td>{data.values[index] != null ? number(data.values[index])
              : group.status === 'no_data' ? 'Brak próby' : 'Nieobliczalny wynik'}</td>
          </tr>)}</tbody>
        </table>
      </details>
    </div>
    <details className="analytics-hourly-quality">
      <summary><Info size={18} aria-hidden="true" />Informacje o próbie</summary>
      <div className="muted text-xs space-y-2">
        <p>Kompletność rejestracji: nieznana. Zapis nie potwierdza czasu realizacji dostawy. Zmiany bez poprawnych zdarzeń nie należą do tej próby. Jeden zapis nie potwierdza rejestracji przez całą zmianę.</p>
        <dl>
          <div><dt>Zmiany w okresie</dt><dd>{activity.quality.cohortShiftCount}</dd></div>
          <div><dt>Zmiany w próbie</dt><dd>{activity.quality.includedShiftCount}</dd></div>
          <div><dt>Zmiany bez poprawnych zdarzeń</dt><dd>{activity.quality.shiftsWithoutValidEvents}</dd></div>
          <div><dt>Zmiany wykluczone przez nakładanie</dt><dd>{activity.quality.excludedOverlapShiftCount}</dd></div>
          <div><dt>Zdarzenia poza czasem zmiany lub późniejsze</dt><dd>{activity.quality.invalidEventCount}</dd></div>
          <div><dt>Poprawne zdarzenia nakładających się zmian</dt><dd>{activity.quality.overlapEventCount}</dd></div>
          <div><dt>Łącznie wykluczone zdarzenia</dt><dd>{activity.quality.excludedEventCount}</dd></div>
        </dl>
        <p>Kategorie zmian mogą się pokrywać. Wykluczenia dotyczą tylko tej analizy; zapisane dane pozostają zachowane.</p>
      </div>
    </details>
  </>;
}

export default function AnalyticsHourlyActivity({ activity, status, message, eventPlatform, onEventPlatformChange, onRetry }) {
  return <section className="analytics-section" aria-labelledby="analytics-hourly-title">
    <h2 id="analytics-hourly-title" className="analytics-section-title">Najlepsze godziny</h2>
    <div>
      <label htmlFor="analytics-event-platform" className="mb-2 block text-sm">Platforma zarejestrowanych dostaw</label>
      <select id="analytics-event-platform" value={eventPlatform} onChange={event => onEventPlatformChange(event.target.value)}>
        <option value="all">Wszystkie platformy</option>
        {platforms.map(platform => <option key={platform.value} value={platform.value}>{platform.label}</option>)}
      </select>
    </div>
    <p className="muted text-xs">Ręcznie zarejestrowane dostawy Floating Order Tracking. Wynik nie potwierdza kompletności wszystkich dostaw.</p>
    {status === 'loading' && <p role="status">Wczytywanie danych godzinowych...</p>}
    {status === 'error' && <div>
      <p role="alert">{message}</p>
      <button type="button" className="py-2 underline" onClick={onRetry}>Spróbuj ponownie</button>
    </div>}
    {status === 'success' && activity && <ActivityResult activity={activity} />}
  </section>;
}
