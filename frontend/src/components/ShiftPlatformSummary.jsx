import { formatMoney } from '../utils/shiftFormat.js';
import PlatformBadge from './PlatformBadge.jsx';
import { Link } from 'react-router';

export default function ShiftPlatformSummary({ shift }) {
  if (!shift.platformEntries.length) return <p>Uzupełnij platformy, zarobki i zamówienia w edycji zmiany.</p>;
  return (
    <div className="card space-y-4">
      <ul className="space-y-3">
        {shift.platformEntries.map((entry) => <li key={entry.platform} className="flex flex-wrap items-center justify-between gap-2">
          <PlatformBadge platform={entry.platform} />
          <span className="text-sm">{formatMoney(entry.earningsGross)} brutto · {entry.ordersCount} zam.</span>
        </li>)}
      </ul>
      <p className="border-t border-slate-700 pt-3">Łączny zarobek brutto: <strong className="earnings">{formatMoney(shift.totalEarnings)}</strong></p>
      {shift.estimatedNetEarnings != null
        ? <p>Szacowane netto: <strong className="earnings">{formatMoney(shift.estimatedNetEarnings)}</strong></p>
        : <p className="muted text-sm">Aby zobaczyć szacowane netto, <Link to="/settings" className="text-link">ustaw profil</Link>.</p>}
      <p>Łączna liczba zamówień: <strong>{shift.totalOrders}</strong></p>
    </div>
  );
}
