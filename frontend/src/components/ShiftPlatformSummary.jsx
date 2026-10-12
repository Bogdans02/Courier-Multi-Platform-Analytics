import { platforms } from '../utils/platformEntries.js';
import { formatMoney } from '../utils/shiftFormat.js';

export default function ShiftPlatformSummary({ shift }) {
  if (!shift.platformEntries.length) return <p>Uzupełnij platformy, zarobki i zamówienia w edycji zmiany.</p>;
  return (
    <div className="space-y-2">
      <ul>
        {shift.platformEntries.map((entry) => <li key={entry.platform}>
          <strong>{platforms.find(({ value }) => value === entry.platform)?.label}</strong>
          {`: ${formatMoney(entry.earningsGross)} · Zamówienia: ${entry.ordersCount}`}
        </li>)}
      </ul>
      <p>Łączny zarobek brutto: <strong>{formatMoney(shift.totalEarnings)}</strong></p>
      <p>Łączna liczba zamówień: <strong>{shift.totalOrders}</strong></p>
    </div>
  );
}
