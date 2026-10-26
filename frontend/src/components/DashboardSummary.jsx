import { formatMoney } from '../utils/shiftFormat.js';
import { ChartNoAxesColumnIncreasing, Clock, Package, Wallet } from 'lucide-react';
import IncompleteShiftsNotice from './IncompleteShiftsNotice.jsx';

function number(value) {
  return value === null ? 'Brak danych' : Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
}

function money(value) {
  return value === null ? 'Brak danych' : formatMoney(value);
}

function summaryMetrics(summary) {
  return [
    [summary.mode === 'estimated_net' ? 'Zarobek · szac. netto' : 'Zarobek brutto', money(summary.totalEarnings), Wallet],
    ['Zamówienia', number(summary.totalOrders), Package],
    ['Czas pracy', `${number(summary.totalHours)} godz.`, Clock],
    ['Zarobek / h', money(summary.earningsPerHour), ChartNoAxesColumnIncreasing],
    ['Łączne koszty w okresie', money(summary.totalExpenses)],
    ['Liczba zmian', number(summary.shiftCount)],
    ['Łączny dystans', summary.distanceShiftCount ? `${number(summary.totalDistance)} km` : 'Brak danych'],
    ['Średni zarobek na zmianę', money(summary.earningsPerShift)],
    ['Zarobek na kilometr (zł/km)', money(summary.earningsPerKm)],
    ['Zamówienia na godzinę', number(summary.ordersPerHour)],
    ['Średni zarobek na zamówienie', money(summary.earningsPerOrder)],
  ];
}

export default function DashboardSummary({ summary }) {
  const metrics = summaryMetrics(summary);

  return (
    <>
      <IncompleteShiftsNotice count={summary.incompleteShiftCount} />
      {summary.shiftCount === 0 && <p>Brak uzupełnionych zmian w wybranym okresie.</p>}
      <dl className="metric-grid">
        {metrics.slice(0, 4).map(([label, value, MetricIcon]) => (
          <div key={label} className="card metric-card">
            <dt><span>{label}</span><span className="metric-icon"><MetricIcon size={22} strokeWidth={1.8} aria-hidden="true" /></span></dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function DashboardDetails({ summary }) {
  const metrics = summaryMetrics(summary);
  return <>
      <details className="card secondary-metrics"><summary>Więcej wyników</summary>
        <dl className="metric-grid">{metrics.slice(4).map(([label, value]) => <div key={label} className="metric-card">
          <dt className="muted text-xs">{label}</dt><dd>{value}</dd>
        </div>)}</dl>
        <p className="muted text-xs">Dystans: {summary.distanceShiftCount} z {summary.shiftCount} zmian. Zł/km dotyczy tylko zmian z podanym dystansem.</p>
        <p className="muted mt-2 text-xs">Koszty: według daty w Polsce, z pełnymi dniami granicznymi, również bez powiązanej zmiany. Nie pomniejszają zarobków; kwota wspólna dla brutto i netto.</p>
      </details>
    </>;
}
