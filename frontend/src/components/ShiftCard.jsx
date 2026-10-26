import { Link } from 'react-router';
import { formatCompactDuration, formatDateTime, formatDistance, formatMoney } from '../utils/shiftFormat.js';
import PlatformBadge from './PlatformBadge.jsx';
import { ChevronRight, Clock, Route } from 'lucide-react';
import { shiftEarnings } from '../utils/earningsMode.js';

export default function ShiftCard({ shift, mode = 'auto' }) {
  const complete = shift.platformEntries.length > 0;
  const earnings = shiftEarnings(shift, mode);
  const start = new Date(shift.startedAt);
  const end = new Date(shift.endedAt);
  const timeOptions = { hour: '2-digit', minute: '2-digit' };
  const sameDay = start.toDateString() === end.toDateString();
  return <article className="card shift-card">
    <div className="shift-card-heading">
      <div className="min-w-0">
        <h3><Link to={`/shifts/${shift.id}`} className="shift-card-link" aria-label={`Szczegóły zmiany z ${formatDateTime(shift.startedAt)}`}>
          {start.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' })}
        </Link></h3>
        <p className="shift-time">{start.toLocaleTimeString('pl-PL', timeOptions)} – {sameDay
          ? end.toLocaleTimeString('pl-PL', timeOptions)
          : end.toLocaleString('pl-PL', { day: 'numeric', month: 'short', ...timeOptions })}</p>
      </div>
      <div className="shift-amount">
        <p className={complete ? 'earnings' : 'text-amber-300'}>{complete ? formatMoney(earnings.amount) : 'Do uzupełnienia'}</p>
        <p className="muted text-xs">{complete ? `${shift.totalOrders} zamówień · ${earnings.label}` : 'Brak wpisów platform'}</p>
      </div>
    </div>
    <div className="shift-platforms">{shift.platformEntries.map(({ platform }) => <PlatformBadge key={platform} platform={platform} />)}</div>
    <dl className="shift-stats">
      <div><dt><Clock size={22} strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Czas pracy</span></dt><dd>{formatCompactDuration(shift.durationSeconds)}</dd></div>
      <div><dt><Route size={22} strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Dystans</span></dt><dd>{formatDistance(shift.distanceKm)}</dd></div>
    </dl>
    <ChevronRight size={22} strokeWidth={1.8} className="shift-card-arrow" aria-hidden="true" />
  </article>;
}
