import { httpError } from '../utils/httpError.js';

export function validateCalendarSelection({ calendar, period, anchor, asOf }, now) {
  if (calendar === undefined) {
    if (anchor !== undefined || asOf !== undefined) {
      throw httpError(400, 'Parametry anchor i asOf wymagają wyboru calendar.');
    }
    return null;
  }
  if (!['week', 'month', 'all'].includes(calendar) || period !== undefined) {
    throw httpError(400, 'Wybierz calendar: week, month lub all, bez parametru period.');
  }
  if (calendar === 'all') {
    if (anchor !== undefined) throw httpError(400, 'Dla calendar=all nie podawaj anchor.');
  } else {
    const date = typeof anchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(anchor)
      ? new Date(`${anchor}T00:00:00.000Z`) : null;
    if (!date || !Number.isFinite(date.getTime()) || anchor.startsWith('0000')
      || date.toISOString().slice(0, 10) !== anchor) {
      throw httpError(400, 'Podaj poprawny anchor w formacie RRRR-MM-DD.');
    }
  }
  let observation = now;
  if (asOf !== undefined) {
    if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(asOf)) {
      throw httpError(400, 'Podaj poprawny asOf jako datę ISO w UTC zakończoną Z.');
    }
    observation = new Date(asOf);
    const canonical = asOf.includes('.') ? asOf : asOf.replace('Z', '.000Z');
    if (!Number.isFinite(observation.getTime()) || observation.toISOString() !== canonical || observation > now) {
      throw httpError(400, 'asOf musi być poprawną chwilą UTC niepóźniejszą niż czas serwera.');
    }
  }
  return { calendar, anchor, asOf: observation };
}

export function validateEarningsMode(value = 'gross') {
  if (!['gross', 'estimated_net'].includes(value)) {
    throw httpError(400, 'Wybierz brutto lub szacowane netto.');
  }
  return value;
}

export function validateSummaryPeriod(value = 'all') {
  if (!['week', 'month', 'three_months', 'all', 'current_week'].includes(value)) {
    throw httpError(400, 'Wybierz poprawny okres: tydzień, miesiąc, 3 miesiące lub cały okres.');
  }
  return value;
}

export function validateAnalyticsPlatform(value = 'all') {
  if (!['all', 'glovo', 'bolt_food', 'uber_eats', 'pyszne_pl', 'wolt', 'other'].includes(value)) {
    throw httpError(400, 'Wybierz poprawną platformę.');
  }
  return value;
}
