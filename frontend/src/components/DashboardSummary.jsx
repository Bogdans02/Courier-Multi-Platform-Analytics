import { formatMoney } from '../utils/shiftFormat.js';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

function number(value) {
  return value == null ? 'Brak danych' : Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
}

function money(value) {
  return value == null ? '—' : formatMoney(value);
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

// Zmiana względem poprzedniego okresu. Procent liczy backend; tu go tylko pokazujemy.
function Comparison({ metric }) {
  if (!metric) return null;
  if (metric.changePercent == null || metric.reason) {
    return <span className="metric-comparison">{comparisonReasons[metric.reason] ?? 'Brak porównania'}</span>;
  }
  const change = Number(metric.changePercent);
  const ChangeIcon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const tone = change === 0 ? 'neutral' : change > 0 ? 'up' : 'down';
  return <span className="metric-comparison" data-tone={tone}>
    <ChangeIcon size={14} aria-hidden="true" /><span>{percent.format(change)}%</span>
  </span>;
}

// Karta-bohater: najważniejsza odpowiedź — ile realnie zarabiam na godzinę i czy lepiej niż ostatnio.
export default function DashboardSummary({ summary }) {
  const net = summary.mode === 'estimated_net';
  const moneyLabel = net ? 'szacowane netto' : 'brutto';
  // Porównania nie pokazujemy dla "Całość", bo nie ma poprzedniego okresu.
  const comparison = summary.selection?.kind === 'all' ? null : summary.comparison;
  const previousPeriod = summary.selection?.kind === 'month' ? 'miesiąca' : 'tygodnia';
  const since = summary.selection?.isPartial
    ? `analogicznej części poprzedniego ${previousPeriod}` : `poprzedniego ${previousPeriod}`;

  if (summary.shiftCount === 0) {
    return <section className="card" aria-labelledby="analytics-earnings-title">
      <h2 id="analytics-earnings-title" className="card-title">Ile zarabiam</h2>
      <p className="muted text-sm">Brak uzupełnionych zmian w wybranym okresie.</p>
    </section>;
  }

  return (
    <section className="card earnings-hero" aria-labelledby="analytics-earnings-title">
      <h2 id="analytics-earnings-title" className="card-title">Ile zarabiam · {moneyLabel}</h2>
      <p className="earnings-hero-rate">{money(summary.earningsPerHour)}{summary.earningsPerHour != null && <span>/h</span>}</p>
      {comparison && <p className="earnings-hero-change">
        <Comparison metric={comparison.metrics.earningsPerHour} /><span className="muted">względem {since}</span>
      </p>}
      <dl className="earnings-hero-grid">
        <div><dt>Zarobek</dt><dd>{money(summary.totalEarnings)}</dd>{comparison && <Comparison metric={comparison.metrics.totalEarnings} />}</div>
        <div><dt>Na zamówienie</dt><dd>{money(summary.earningsPerOrder)}</dd></div>
        <div><dt>Na kilometr</dt><dd>{money(summary.earningsPerKm)}</dd></div>
      </dl>
      <p className="muted text-xs earnings-hero-context">
        {number(summary.shiftCount)} {summary.shiftCount === 1 ? 'zmiana' : 'zmian'} · {number(summary.totalOrders)} zam. · {number(summary.totalHours)} h
      </p>
    </section>
  );
}

// Dodatkowe liczby dla zainteresowanych — w zwijanej sekcji szczegółów, nie na wierzchu.
export function DashboardDetails({ summary }) {
  const metrics = [
    ['Średni zarobek na zmianę', money(summary.earningsPerShift)],
    ['Liczba zmian', number(summary.shiftCount)],
    ['Dostawy na godzinę', number(summary.ordersPerHour)],
    ['Łączny dystans', summary.distanceShiftCount ? `${number(summary.totalDistance)} km` : 'Brak danych'],
    ['Łączne koszty w okresie', money(summary.totalExpenses)],
  ];
  return <section className="analytics-section" aria-labelledby="additional-metrics-title">
    <h3 id="additional-metrics-title" className="analytics-chart-title">Dodatkowe wskaźniki <span className="muted text-xs font-normal">· wszystkie platformy</span></h3>
    <dl className="analytics-extra-metrics">{metrics.map(([label, value]) => <div key={label} className="metric-card">
      <dt className="muted text-xs">{label}</dt><dd>{value}</dd>
    </div>)}</dl>
    <p className="muted text-xs">Zł/km dotyczy tylko zmian z podanym dystansem ({summary.distanceShiftCount} z {summary.shiftCount}). Koszty nie pomniejszają zarobków.</p>
  </section>;
}
