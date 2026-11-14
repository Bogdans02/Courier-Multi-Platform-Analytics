import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Clock } from 'lucide-react';

// Na ekranie Dziś pokazuje, że zmiana trwa, z licznikiem czasu w czasie rzeczywistym.
function elapsed(startedAt, now) {
  const total = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return [Math.floor(total / 3600), Math.floor(total % 3600 / 60), total % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');
}

export default function ActiveShiftTimer({ startedAt }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Link to="/shifts/active" className="card active-shift-banner">
      <span className="active-shift-dot" aria-hidden="true" />
      <span className="active-shift-body">
        <span className="active-shift-label"><Clock size={16} strokeWidth={1.8} aria-hidden="true" />Zmiana trwa</span>
        <strong className="active-shift-time" role="timer" aria-label="Czas aktywnej zmiany">{elapsed(startedAt, now)}</strong>
      </span>
      <span className="active-shift-action">Wróć do zmiany<ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" /></span>
    </Link>
  );
}
