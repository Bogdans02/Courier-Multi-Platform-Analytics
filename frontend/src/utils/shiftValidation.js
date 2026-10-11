export function validateShiftForm({ startedAt, endedAt, distanceKm }) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!startedAt || !endedAt || !Number.isFinite(start) || !Number.isFinite(end)) {
    return 'Podaj poprawną datę i godzinę rozpoczęcia oraz zakończenia.';
  }
  if (end <= start) return 'Zakończenie zmiany musi być późniejsze niż rozpoczęcie.';
  if (distanceKm !== '' && !/^\d{1,8}(\.\d{1,2})?$/.test(distanceKm)) {
    return 'Podaj nieujemny dystans, maksymalnie z dwoma miejscami po przecinku.';
  }
  return '';
}

export function shiftFormPayload(values) {
  return {
    startedAt: new Date(values.startedAt).toISOString(),
    endedAt: new Date(values.endedAt).toISOString(),
    distanceKm: values.distanceKm === '' ? null : values.distanceKm,
  };
}
