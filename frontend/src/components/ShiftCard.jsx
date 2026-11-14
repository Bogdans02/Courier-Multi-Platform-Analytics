import { Link } from 'react-router';
import { formatCompactDuration, formatDistance, formatMoney } from '../utils/shiftFormat.js';
import { formatDateTime, formatDay, formatTimeRange } from '../utils/dateFormat.js';
import PlatformBadge from './PlatformBadge.jsx';
import { ChevronRight, Clock, Route } from 'lucide-react';
import { shiftEarnings } from '../utils/earningsMode.js';
import { hourlyRate } from '../utils/historySummary.js';

// showRate i showCompleteAction włącza tylko Historia — na ekranie Start karta wygląda jak wcześniej.
export default function ShiftCard({ shift, mode = 'auto', showRate = false, showCompleteAction = false }) {
  const complete = shift.platformEntries.length > 0;
  const earnings = shiftEarnings(shift, mode);
  const rate = complete ? hourlyRate(earnings.amount, shift.durationSeconds) : null;
  const highlight = showCompleteAction && !complete;
  return <article className={`card shift-card${highlight ? ' shift-card-incomplete' : ''}`}>
    <div className="shift-card-heading">
      <div className="min-w-0">
        <h3><Link to={`/shifts/${shift.id}`} className="shift-card-link" aria-label={`Szczegóły zmiany z ${formatDateTime(shift.startedAt)}`}>
          {formatDay(shift.startedAt)}
        </Link></h3>
        <p className="shift-time">{formatTimeRange(shift.startedAt, shift.endedAt)}</p>
      </div>
      <div className="shift-amount">
        <p className={complete ? 'earnings' : 'text-amber-300'}>{complete ? formatMoney(earnings.amount) : 'Do uzupełnienia'}</p>
        {showRate && complete && <p className="shift-rate">{rate === null ? '— zł/h' : `${formatMoney(rate)}/h`}</p>}
        <p className="muted text-xs">{complete ? `${shift.totalOrders} zamówień · ${earnings.label}` : 'Brak wpisów platform'}</p>
      </div>
    </div>
    <div className="shift-platforms">{shift.platformEntries.map(({ platform }) => <PlatformBadge key={platform} platform={platform} />)}</div>
    <dl className="shift-stats">
      <div><dt><Clock size={22} strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Czas pracy</span></dt><dd>{formatCompactDuration(shift.durationSeconds)}</dd></div>
      <div><dt><Route size={22} strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Dystans</span></dt><dd>{formatDistance(shift.distanceKm)}</dd></div>
    </dl>
    {highlight && <Link to={`/shifts/${shift.id}`} state={{ summary: true }} className="button-secondary shift-card-action">Uzupełnij</Link>}
    <ChevronRight size={22} strokeWidth={1.8} className="shift-card-arrow" aria-hidden="true" />
  </article>;
}
