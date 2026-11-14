import { Trophy } from 'lucide-react';
import AnalyticsChart from './AnalyticsChart.jsx';
import { analyticsChartData, analyticsLabel } from '../utils/analyticsFormat.js';
import { formatMoney } from '../utils/shiftFormat.js';

// Dni tygodnia zawsze według zarobku na godzinę — to odpowiada na pytanie "kiedy wychodzić".
const rateMetric = { key: 'earningsPerHour', unit: 'zł/h' };

function BestWeekday({ best }) {
  const available = best.status === 'available';
  return <div className="analytics-best-weekday">
    <div className="flex items-center gap-2">
      <Trophy size={18} className="muted" aria-hidden="true" />
      <h3 className="analytics-chart-title">Najlepszy dzień</h3>
    </div>
    {available ? <div className="analytics-best-result">
      <p>{best.days.map(day => analyticsLabel('weekdays', day)).join(', ')}</p>
      <p className="analytics-best-rate">{formatMoney(best.earningsPerHour)}/h</p>
    </div> : <p className="muted text-sm">{best.status === 'all_zero' ? 'Brak wyróżniającego się dnia' : 'Brak danych'}</p>}
  </div>;
}

export default function AnalyticsEfficiency({ details }) {
  const data = analyticsChartData('weekdays', details.weekdays, rateMetric.key);
  const hasData = data.values.some(value => value !== null);
  return <section className="card analytics-chart-card">
    <h3 className="analytics-chart-title">Zarobek na godzinę według dnia tygodnia</h3>
    <p className="muted text-xs">{details.mode === 'estimated_net' ? 'Szacowane netto' : 'Brutto'} · według dnia rozpoczęcia zmiany.</p>
    {hasData
      ? <AnalyticsChart title={`Zarobek na godzinę według dnia tygodnia, ${rateMetric.unit}`} unit={rateMetric.unit} type="bar" {...data} />
      : <p className="muted py-4 text-sm">Brak danych dla tego okresu.</p>}
    <BestWeekday best={details.bestWeekdays} />
  </section>;
}
