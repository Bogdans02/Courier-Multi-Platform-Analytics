import { validatePlatformEntries } from './platformEntries.js';
import { toLocalDateTime } from './shiftFormat.js';

// Pole pokazuje czas tylko do minuty. Jeśli kurier nie zmienił godziny, bierzemy dokładny
// czas z serwera, żeby zapis formularza nie obcinał sekund.
function exactTime(value, original) {
  return original && value === toLocalDateTime(original)
    ? new Date(original).toISOString()
    : new Date(value).toISOString();
}

function matchesCalendarDate(value, timestamp) {
  const date = new Date(timestamp);
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  // Date normalizes invalid days, e.g. February 30 becomes a day in March.
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

export function validateShiftForm({ startedAt, endedAt, distanceKm, platformEntries }, original = {}) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!startedAt || !endedAt || !Number.isFinite(start) || !Number.isFinite(end)
    || !matchesCalendarDate(startedAt, start) || !matchesCalendarDate(endedAt, end)) {
    return 'Podaj poprawną datę i godzinę rozpoczęcia oraz zakończenia.';
  }
  // Porównujemy dokładne czasy: zmiana krótsza niż minuta ma w polach tę samą godzinę.
  if (new Date(exactTime(endedAt, original.endedAt)) <= new Date(exactTime(startedAt, original.startedAt))) {
    return 'Zakończenie zmiany musi być późniejsze niż rozpoczęcie.';
  }
  if (distanceKm !== '' && !/^\d{1,8}(\.\d{1,2})?$/.test(distanceKm)) {
    return 'Podaj nieujemny dystans, maksymalnie z dwoma miejscami po przecinku.';
  }
  return validatePlatformEntries(platformEntries);
}

export function shiftFormPayload(values, original = {}) {
  return {
    startedAt: exactTime(values.startedAt, original.startedAt),
    endedAt: exactTime(values.endedAt, original.endedAt),
    distanceKm: values.distanceKm === '' ? null : values.distanceKm,
    platformEntries: values.platformEntries.map(({ platform, earningsGross, ordersCount }) => ({
      platform, earningsGross, ordersCount: Number(ordersCount),
    })),
  };
}
