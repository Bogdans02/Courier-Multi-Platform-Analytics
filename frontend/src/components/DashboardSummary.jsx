import { formatMoney } from '../utils/shiftFormat.js';
import { ArrowDownRight, ArrowUpRight, ChartNoAxesColumnIncreasing, Clock, Gauge, Minus, Package, Route, Wallet } from 'lucide-react';

function number(value) {
  return value == null ? 'Brak danych' : Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
}

function money(value) {
  return value == null ? 'Brak danych' : formatMoney(value);
}

const comparisonReasons = {
  no_current_observations: 'Brak bieżących danych',
  no_previous_observations: 'Brak poprzednich danych',
  undefined_metric: 'Nieobliczalny wskaźnik',
  previous_zero: 'Poprzedni wynik: 0',
};
const percent = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero',
});

function MetricComparison({ metric, neutral }) {
  if (metric?.changePercent == null || metric.reason) {
    return <span className="metric-comparison">{comparisonReasons[metric?.reason] ?? 'Brak porównania'}</span>;
  }
  // Format the final backend percentage; never derive it from card values.
  const change = Number(metric.changePercent);
  const ChangeIcon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const tone = neutral || change === 0 ? 'neutral' : change > 0 ? 'up' : 'down';
  return <span className="metric-comparison" data-tone={tone}>
    <ChangeIcon size={14} aria-hidden="true" /><span>{percent.format(change)}%</span>
  </span>;
}

export default function DashboardSummary({ summary }) {
  const metrics = [
    ['totalEarnings', 'Zarobek', money(summary.totalEarnings), Wallet],
    ['totalHours', 'Czas pracy', summary.totalHours == null ? 'Brak danych' : `${number(summary.totalHours)} godz.`, Clock],
    ['totalOrders', 'Zamówienia', number(summary.totalOrders), Package],
    ['earningsPerHour', 'Zarobek / h', money(summary.earningsPerHour), ChartNoAxesColumnIncreasing],
    ['earningsPerKm', 'Stawka / km', money(summary.earningsPerKm), Route],
    ['ordersPerHour', 'Dostawy / h', number(summary.ordersPerHour), Gauge],
  ];
  const comparison = summary.selection?.kind === 'all' ? null : summary.comparison;
  const previousPeriod = summary.selection?.kind === 'month' ? 'miesiąca' : 'tygodnia';

  return (
    <section className="analytics-section" aria-labelledby="analytics-summary-title">
      <h2 id="analytics-summary-title" className="analytics-section-title">Podsumowanie</h2>
      {comparison && <p className="muted text-xs">Zmiana względem {summary.selection?.isPartial
        ? `analogicznej części poprzedniego ${previousPeriod}` : `poprzedniego ${previousPeriod}`}</p>}
      {summary.shiftCount === 0 && <p>Brak uzupełnionych zmian w wybranym okresie.</p>}
      <dl className="metric-grid analytics-kpis">
        {metrics.map(([key, label, value, MetricIcon], index) => (
          <div key={key} data-metric={key} className={`card metric-card${index < 4 ? ' analytics-kpi-primary' : ''}`}>
            <dt><span>{label}</span><span className="metric-icon"><MetricIcon size={22} strokeWidth={1.8} aria-hidden="true" /></span></dt>
            <dd><span className="analytics-kpi-value">{value}</span>
              {comparison && <MetricComparison metric={comparison.metrics[key]} neutral={key === 'totalHours'} />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DashboardDetails({ summary }) {
  const metrics = [
    ['Średni zarobek na zmianę', money(summary.earningsPerShift)],
    ['Średni zarobek na zamówienie', money(summary.earningsPerOrder)],
    ['Liczba zmian', number(summary.shiftCount)],
    ['Łączny dystans', summary.distanceShiftCount ? `${number(summary.totalDistance)} km` : 'Brak danych'],
    ['Łączne koszty w okresie', money(summary.totalExpenses)],
  ];
  return <section className="analytics-section" aria-labelledby="additional-metrics-title">
        <h3 id="additional-metrics-title" className="analytics-chart-title">Dodatkowe wskaźniki <span className="muted text-xs font-normal">· wszystkie platformy</span></h3>
        <dl className="analytics-extra-metrics">{metrics.map(([label, value]) => <div key={label} className="metric-card">
          <dt className="muted text-xs">{label}</dt><dd>{value}</dd>
        </div>)}</dl>
        <p className="muted text-xs">Dystans: {summary.distanceShiftCount} z {summary.shiftCount} zmian. Zł/km dotyczy tylko zmian z podanym dystansem.</p>
        <p className="muted text-xs">Koszty: według daty w Polsce, z pełnymi dniami granicznymi, również bez powiązanej zmiany. Nie pomniejszają zarobków; kwota wspólna dla brutto i netto.</p>
    </section>;
}
