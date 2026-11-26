import { formatMoney } from '../utils/shiftFormat.js';

// Pasek postępu dziennego celu, wbudowany w sekcję „Dzisiaj” pod metrykami.
// Zarobek liczymy w aktualnym trybie (netto/brutto), tym samym co karta „Dzisiaj”.
// Bez ustawionego celu nic nie pokazujemy.
export default function DailyGoalProgress({ earnings, goal }) {
  if (goal == null) return null;
  const earned = Number(earnings);
  const target = Number(goal);
  const reached = target > 0 && earned >= target;
  // Pasek nie przekracza 100%, nawet gdy kurier zarobił więcej niż cel.
  const percent = target > 0 ? Math.min(100, Math.round((earned / target) * 100)) : 0;

  return <div className="daily-goal">
    <div className="daily-goal-head">
      <span className="daily-goal-label">Cel dzienny · {percent}%</span>
      <span className="daily-goal-amount">{formatMoney(earned)} / {formatMoney(target)}</span>
    </div>
    <div className="daily-goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={percent} aria-label="Postęp celu dziennego">
      <div className={`daily-goal-fill${reached ? ' is-reached' : ''}`} style={{ width: `${percent}%` }} />
    </div>
    {reached && <p className="daily-goal-reached text-emerald-300">Cel osiągnięty</p>}
  </div>;
}
