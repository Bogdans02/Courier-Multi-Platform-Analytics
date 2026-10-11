import { httpError } from '../utils/httpError.js';

export function validateShiftId(value) {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
    throw httpError(400, 'Niepoprawny identyfikator zmiany.');
  }
  return id;
}

function parseTime(value) {
  // API accepts explicit UTC times, avoiding ambiguous local dates.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw httpError(400, 'Podaj poprawną datę i godzinę rozpoczęcia oraz zakończenia.');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw httpError(400, 'Podaj poprawną datę i godzinę rozpoczęcia oraz zakończenia.');
  }
  return date;
}

export function validateShiftUpdate(body) {
  const startedAt = parseTime(body?.startedAt);
  const endedAt = parseTime(body?.endedAt);
  if (endedAt <= startedAt) {
    throw httpError(400, 'Zakończenie zmiany musi być późniejsze niż rozpoczęcie.');
  }
  let distanceKm = body.distanceKm ?? null;
  if (distanceKm !== null) {
    if ((typeof distanceKm !== 'string' && typeof distanceKm !== 'number')
      || !/^\d{1,8}(\.\d{1,2})?$/.test(String(distanceKm))) {
      throw httpError(400, 'Podaj nieujemny dystans, maksymalnie z dwoma miejscami po przecinku.');
    }
    distanceKm = String(distanceKm);
  }
  return { startedAt, endedAt, distanceKm };
}
