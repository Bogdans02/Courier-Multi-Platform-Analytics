export function formatDateTime(value) {
  return new Date(value).toLocaleString('pl-PL');
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours} godz. ${minutes} min ${total % 60} s`;
}

export function formatDistance(value) {
  return value === null ? 'Nie podano' : `${Number(value).toLocaleString('pl-PL')} km`;
}

export function formatCompactDuration(seconds) {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  return `${Math.floor(minutes / 60)} godz. ${minutes % 60} min`;
}

export function formatMoney(value) {
  return Number(value).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
}

// "Niedziela, 8 listopada" — nagłówek ekranu szczegółów zmiany.
export function formatShiftDay(value) {
  const day = new Date(value).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  return day.charAt(0).toLocaleUpperCase('pl-PL') + day.slice(1);
}

// "08:00 – 12:00", a gdy zmiana kończy się innego dnia: "22:00 – 9 lis, 02:00". Bez sekund.
export function formatTimeRange(start, end) {
  const from = new Date(start);
  const to = new Date(end);
  const time = { hour: '2-digit', minute: '2-digit' };
  const endText = from.toDateString() === to.toDateString()
    ? to.toLocaleTimeString('pl-PL', time)
    : to.toLocaleString('pl-PL', { day: 'numeric', month: 'short', ...time });
  return `${from.toLocaleTimeString('pl-PL', time)} – ${endText}`;
}

// Czas lokalny w formacie pola datetime-local, tylko do minuty: "2026-10-10T10:00".
export function toLocalDateTime(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
