import { Link } from 'react-router';
import { ChevronDown, TriangleAlert } from 'lucide-react';

export default function IncompleteShiftsNotice({ count, description = 'Nie są uwzględniane w statystykach.' }) {
  if (!(count > 0)) return null;

  return <div role="status" className="card incomplete-shifts-note notice-disclosure">
    <details>
      <summary className="text-amber-300">
        <TriangleAlert size={20} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
        <span>Zmiany do uzupełnienia: {count}</span>
        <ChevronDown size={16} className="notice-chevron shrink-0" aria-hidden="true" />
      </summary>
      <div className="notice-description">
        <p className="muted text-xs">{description}</p>
        <Link to="/history" className="text-link inline-flex min-h-8 items-center">Uzupełnij w historii →</Link>
      </div>
    </details>
  </div>;
}
