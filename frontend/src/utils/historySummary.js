import { platforms } from './platformEntries.js';

const warsawDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
});

// Miesiąc jako "RRRR-MM-01" — taki sam format jak w wyborze miesiąca w Analizie.
export function monthOf(date) {
  return `${warsawDate.format(new Date(date)).slice(0, 7)}-01`;
}

export function isComplete(shift) {
  return shift.platformEntries.length > 0;
}

// Zarobek na godzinę: kwota podzielona przez czas trwania zmiany.
export function hourlyRate(amount, durationSeconds) {
  return durationSeconds > 0 ? Number(amount) / (durationSeconds / 3600) : null;
}

export function monthSummary(shifts) {
  const complete = shifts.filter(isComplete);
  // Netto tylko wtedy, gdy każda zmiana ma szacunek — inaczej suma mieszałaby netto z brutto.
  const net = complete.length > 0 && complete.every((shift) => shift.estimatedNetEarnings != null);
  // Sumuję w groszach, żeby uniknąć błędów zaokrągleń przy dodawaniu kwot.
  const cents = complete.reduce((sum, shift) =>
    sum + Math.round(Number(net ? shift.estimatedNetEarnings : shift.totalEarnings) * 100), 0);
  const seconds = complete.reduce((sum, shift) => sum + shift.durationSeconds, 0);
  return {
    earnings: cents / 100,
    hours: seconds / 3600,
    // Stawka miesiąca = suma zarobku / suma godzin (nie średnia ze stawek zmian).
    rate: hourlyRate(cents / 100, seconds),
    label: net ? 'szac. netto' : 'brutto',
    completeCount: complete.length,
    incompleteCount: shifts.length - complete.length,
  };
}

// Platformy, które wystąpiły w zmianach, w stałej kolejności z listy platform.
export function platformsUsed(shifts) {
  return platforms.filter(({ value }) =>
    shifts.some((shift) => shift.platformEntries.some((entry) => entry.platform === value)));
}

// filter: 'all', 'incomplete' albo kod platformy, np. 'bolt_food'.
export function filterShifts(shifts, filter) {
  if (filter === 'all') return shifts;
  if (filter === 'incomplete') return shifts.filter((shift) => !isComplete(shift));
  return shifts.filter((shift) => shift.platformEntries.some((entry) => entry.platform === filter));
}

export function shiftCountLabel(count) {
  if (count === 1) return '1 zmiana';
  const last = count % 10;
  const lastTwo = count % 100;
  return `${count} ${last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'zmiany' : 'zmian'}`;
}
