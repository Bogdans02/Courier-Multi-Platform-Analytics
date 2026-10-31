import { formatMoney } from '../utils/shiftFormat.js';
import { ChartNoAxesColumnIncreasing, Clock, Package, Wallet } from 'lucide-react';

function number(value) {
  return value === null ? 'Brak danych' : Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
}

function money(value) {
  return value === null ? 'Brak danych' : formatMoney(value);
}

function summaryMetrics(summary) {
  return [
    ['Zarobek', money(summary.totalEarnings), Wallet],
    ['Zamówienia', number(summary.totalOrders), Package],
    ['Czas pracy', `${number(summary.totalHours)} godz.`, Clock],
    ['Zarobek / h', money(summary.earningsPerHour), ChartNoAxesColumnIncreasing],
    ['Zamówienia / h', number(summary.ordersPerHour)],
    ['Łączne koszty w okresie', money(summary.totalExpenses)],
    ['Liczba zmian', number(summary.shiftCount)],
    ['Łączny dystans', summary.distanceShiftCount ? `${number(summary.totalDistance)} km` : 'Brak danych'],
    ['Średni zarobek na zmianę', money(summary.earningsPerShift)],
    ['Zarobek na kilometr (zł/km)', money(summary.earningsPerKm)],
  ];
}

export default function DashboardSummary({ summary }) {
  const metrics = summaryMetrics(summary);

  return (
    <section className="analytics-section" aria-labelledby="analytics-summary-title">
      <h2 id="analytics-summary-title" className="analytics-section-title">Podsumowanie</h2>
      {summary.shiftCount === 0 && <p>Brak uzupełnionych zmian w wybranym okresie.</p>}
      <dl className="metric-grid analytics-kpis">
        {metrics.slice(0, 4).map(([label, value, MetricIcon]) => (
          <div key={label} className="card metric-card">
            <dt><span>{label}</span><span className="metric-icon"><MetricIcon size={22} strokeWidth={1.8} aria-hidden="true" /></span></dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DashboardDetails({ summary }) {
  const metrics = summaryMetrics(summary);
  return <section className="analytics-section" aria-labelledby="additional-metrics-title">
        <h3 id="additional-metrics-title" className="analytics-chart-title">Wskaźniki podsumowania <span className="muted text-xs font-normal">· wszystkie platformy</span></h3>
        <dl className="metric-grid analytics-extra-metrics">{metrics.slice(4).map(([label, value]) => <div key={label} className="metric-card">
          <dt className="muted text-xs">{label}</dt><dd>{value}</dd>
        </div>)}</dl>
        <p className="muted text-xs">Dystans: {summary.distanceShiftCount} z {summary.shiftCount} zmian. Zł/km dotyczy tylko zmian z podanym dystansem.</p>
        <p className="muted text-xs">Koszty: według daty w Polsce, z pełnymi dniami granicznymi, również bez powiązanej zmiany. Nie pomniejszają zarobków; kwota wspólna dla brutto i netto.</p>
    </section>;
}
