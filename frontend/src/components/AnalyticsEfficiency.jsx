import { Info, Trophy } from 'lucide-react';
import AnalyticsChart from './AnalyticsChart.jsx';
import { analyticsChartData, analyticsLabel, efficiencyMetrics, efficiencyTrend } from '../utils/analyticsFormat.js';
import { formatMoney } from '../utils/shiftFormat.js';

function EfficiencyChart({ title, kind, rows, metric, mode }) {
  const data = analyticsChartData(kind, rows, metric.key);
  const financialMode = mode === 'estimated_net' ? 'szacowane netto' : 'brutto';
  const label = `${title} — ${metric.label}, ${metric.unit}${metric.key === 'ordersPerHour' ? '' : `, ${financialMode}`}`;
  return <section className="card analytics-chart-card">
    <h3 className="analytics-chart-title">{title}</h3>
    {data.values.some(value => value !== null)
      ? <AnalyticsChart title={label} unit={metric.unit} type={kind === 'weekdays' ? 'bar' : 'line'} {...data} />
      : <p className="muted py-4 text-sm">Brak danych dla wybranej metryki w tym okresie.</p>}
  </section>;
}

function BestWeekday({ best }) {
  const available = best.status === 'available';
  return <section className="card analytics-best-weekday" aria-labelledby="best-weekday-title">
    <div className="flex items-center gap-2">
      <Trophy size={18} className="text-amber-400" aria-hidden="true" />
      <h3 id="best-weekday-title" className="analytics-chart-title">Najlepszy dzień</h3>
      <details className="analytics-sample-info">
        <summary aria-label="Informacje o najlepszym dniu"><Info size={18} aria-hidden="true" /></summary>
        <div className="muted text-xs space-y-2">
          <p>Według zarobku na godzinę dla wszystkich platform i dnia rozpoczęcia zmiany w Polsce. Wynik opisuje zapisaną próbę, także gdy obejmuje jedną zmianę.</p>
          {best.days.map(day => <p key={day.key}>{analyticsLabel('weekdays', day)}: liczba zmian {day.shiftCount}, czas pracy {Number(day.totalHours).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} godz.</p>)}
        </div>
      </details>
    </div>
    {available ? <div className="analytics-best-result">
      <p>{best.days.map(day => analyticsLabel('weekdays', day)).join(', ')}</p>
      <p className="analytics-best-rate">{formatMoney(best.earningsPerHour)}/h</p>
    </div> : <p className="muted text-sm">{best.status === 'all_zero' ? 'Brak wyróżniającego się dnia' : 'Brak danych'}</p>}
  </section>;
}

export default function AnalyticsEfficiency({ details, selection, availableRange, metricKey, onMetricChange }) {
  const metric = efficiencyMetrics.find(item => item.key === metricKey);
  const trend = efficiencyTrend(details, selection, availableRange);
  return <>
    <div className="segmented analytics-efficiency-metrics" role="group" aria-label="Metryka efektywności pracy">
      {efficiencyMetrics.map(item => <button type="button" key={item.key} aria-pressed={item.key === metricKey}
        onClick={() => onMetricChange(item.key)}>{item.label}</button>)}
    </div>
    <p className="muted text-xs">Wszystkie platformy · {details.mode === 'estimated_net' ? 'Szacowane netto' : 'Brutto'}. Według dnia rozpoczęcia zmiany w Polsce.</p>
    <EfficiencyChart title={selection.kind === 'all' ? 'Trend miesięczny' : 'Trend dzienny'} kind={trend.kind}
      rows={trend.rows} metric={metric} mode={details.mode} />
    {selection.kind !== 'week' && <EfficiencyChart title="Wyniki według dnia tygodnia" kind="weekdays"
      rows={details.weekdays} metric={metric} mode={details.mode} />}
    <BestWeekday best={details.bestWeekdays} />
  </>;
}
