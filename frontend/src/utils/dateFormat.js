// Wszystkie daty i godziny pokazywane w aplikacji formatujemy tutaj: jeden wygląd, bez sekund.
// Daty w tekście mają pełną nazwę miesiąca, a okresy w przełącznikach — krótką, żeby się zmieściły.

const time = { hour: '2-digit', minute: '2-digit' };
const weekLabel = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const monthLabel = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', month: 'long', year: 'numeric' });

const capitalize = (text) => text.charAt(0).toLocaleUpperCase('pl-PL') + text.slice(1);

// "2026-11-03" (data bez godziny, np. koszt) czytamy jako dzień w czasie lokalnym, nie jako północ UTC.
function toDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

// "08:00"
export function formatTime(value) {
  return toDate(value).toLocaleTimeString('pl-PL', time);
}

// "Niedziela, 8 listopada" — nagłówki i karty zmian.
export function formatDay(value) {
  return capitalize(toDate(value).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }));
}

// "3 listopada 2026" — data bez dnia tygodnia, np. przy kosztach.
export function formatDate(value) {
  return toDate(value).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// "Niedziela, 8 listopada, 08:00"
export function formatDateTime(value) {
  return `${formatDay(value)}, ${formatTime(value)}`;
}

// "08:00 – 12:00", a gdy zmiana kończy się innego dnia: "22:00 – 02:00 (9 listopada)".
export function formatTimeRange(start, end) {
  const from = toDate(start);
  const to = toDate(end);
  const range = `${formatTime(from)} – ${formatTime(to)}`;
  return from.toDateString() === to.toDateString()
    ? range
    : `${range} (${to.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })})`;
}

// Okresy: "2–8 lis 2026" i "Listopad 2026". anchor to pierwszy dzień okresu, "RRRR-MM-DD".
export function formatWeekRange(anchor) {
  const first = new Date(`${anchor}T00:00:00Z`);
  const last = new Date(first);
  last.setUTCDate(last.getUTCDate() + 6);
  return weekLabel.formatRange(first, last);
}

export function formatMonth(anchor) {
  return capitalize(monthLabel.format(new Date(`${anchor}T00:00:00Z`)));
}
