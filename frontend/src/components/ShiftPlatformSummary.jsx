import { Link } from 'react-router';
import { formatMoney } from '../utils/shiftFormat.js';
import { platformPerOrder } from '../utils/shiftMetrics.js';
import PlatformBadge from './PlatformBadge.jsx';

// Zarobek każdej platformy w zmianie (brutto, tak jak wpisuje kurier) i sumy brutto / netto.
export default function ShiftPlatformSummary({ shift }) {
  return (
    <section className="card" aria-labelledby="shift-platforms-title">
      <h2 id="shift-platforms-title" className="card-title">Platformy</h2>
      <ul className="detail-list">
        {shift.platformEntries.map((entry) => {
          const perOrder = platformPerOrder(entry);
          return <li key={entry.platform}>
            <PlatformBadge platform={entry.platform} />
            <span className="detail-list-value">
              <strong>{formatMoney(entry.earningsGross)}</strong>
              <small>{entry.ordersCount} zam.{perOrder === null ? '' : ` · ${formatMoney(perOrder)}/zam.`}</small>
            </span>
          </li>;
        })}
      </ul>
      <dl className="detail-totals">
        <div><dt>Razem brutto</dt><dd>{formatMoney(shift.totalEarnings)}</dd></div>
        {shift.estimatedNetEarnings != null && <div><dt>Szacowane netto</dt><dd>{formatMoney(shift.estimatedNetEarnings)}</dd></div>}
      </dl>
      {shift.estimatedNetEarnings == null && <p className="muted text-sm mt-3">
        Aby zobaczyć szacowane netto, <Link to="/settings" className="text-link">ustaw profil</Link>.
      </p>}
    </section>
  );
}
