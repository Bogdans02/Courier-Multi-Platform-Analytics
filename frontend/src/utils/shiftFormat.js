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

export function toLocalDateTime(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
}
