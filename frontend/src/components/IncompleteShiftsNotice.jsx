import { Link } from 'react-router';
import { TriangleAlert } from 'lucide-react';

export default function IncompleteShiftsNotice({ count, description = 'Nie są uwzględniane w statystykach.' }) {
  if (!(count > 0)) return null;

  return <div role="status" className="card incomplete-shifts-note flex items-start gap-3">
    <TriangleAlert size={20} strokeWidth={1.8} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
    <div className="min-w-0">
      <p className="font-semibold text-amber-300">Zmiany do uzupełnienia: {count}</p>
      <p className="muted mt-1 text-xs">{description}</p>
      <Link to="/history" className="text-link inline-flex min-h-8 items-center">Uzupełnij w historii →</Link>
    </div>
  </div>;
}
