import { httpError } from '../utils/httpError.js';

export function validateSummaryPeriod(value = 'all') {
  if (!['week', 'month', 'three_months', 'all'].includes(value)) {
    throw httpError(400, 'Wybierz poprawny okres: tydzień, miesiąc, 3 miesiące lub cały okres.');
  }
  return value;
}
