import { validatePlatformEntries } from './platformEntries.js';

export function validateShiftForm({ startedAt, endedAt, distanceKm, platformEntries }) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!startedAt || !endedAt || !Number.isFinite(start) || !Number.isFinite(end)) {
    return 'Podaj poprawną datę i godzinę rozpoczęcia oraz zakończenia.';
  }
  if (end <= start) return 'Zakończenie zmiany musi być późniejsze niż rozpoczęcie.';
  if (distanceKm !== '' && !/^\d{1,8}(\.\d{1,2})?$/.test(distanceKm)) {
    return 'Podaj nieujemny dystans, maksymalnie z dwoma miejscami po przecinku.';
  }
  return validatePlatformEntries(platformEntries);
}

export function shiftFormPayload(values) {
  return {
    startedAt: new Date(values.startedAt).toISOString(),
    endedAt: new Date(values.endedAt).toISOString(),
    distanceKm: values.distanceKm === '' ? null : values.distanceKm,
    platformEntries: values.platformEntries.map(({ platform, earningsGross, ordersCount }) => ({
      platform, earningsGross, ordersCount: Number(ordersCount),
    })),
  };
}
