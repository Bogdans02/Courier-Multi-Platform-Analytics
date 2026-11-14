import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';

// Przycisk "wstecz" nad tytułem ekranów otwieranych z innego ekranu (szczegóły zmiany, koszty, ustawienia).
// Prowadzi zawsze do konkretnego ekranu, więc działa też po wejściu z powiadomienia czy po odświeżeniu.
export default function BackLink({ to, children }) {
  return <Link to={to} className="back-link"><ChevronLeft size={20} aria-hidden="true" />{children}</Link>;
}
