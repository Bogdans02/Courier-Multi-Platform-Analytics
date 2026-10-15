import { httpError } from '../utils/httpError.js';

export const expenseCategories = ['fuel', 'vehicle_service', 'vehicle_rental', 'phone', 'other'];

export function validateExpenseId(value) {
  if (!['string', 'number'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isInteger(Number(value))
    || Number(value) <= 0 || Number(value) > 2147483647) {
    throw httpError(400, 'Niepoprawny identyfikator kosztu lub zmiany.');
  }
  return Number(value);
}

function validateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, 'Podaj poprawną datę w formacie RRRR-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value.startsWith('0000')) {
    throw httpError(400, 'Podaj poprawną datę.');
  }
  return value;
}

export function validateExpense(body) {
  if (!expenseCategories.includes(body?.category)) throw httpError(400, 'Wybierz poprawną kategorię kosztu.');
  if (!['string', 'number'].includes(typeof body.amount) || !/^\d{1,10}(\.\d{1,2})?$/.test(String(body.amount))) {
    throw httpError(400, 'Podaj nieujemną kwotę kosztu, maksymalnie z dwoma miejscami po przecinku.');
  }
  const expenseDate = validateDate(body.expenseDate);
  const shiftId = body.shiftId === null || body.shiftId === undefined ? null : validateExpenseId(body.shiftId);
  if (body.note !== null && body.note !== undefined && typeof body.note !== 'string') {
    throw httpError(400, 'Notatka musi być tekstem.');
  }
  return { category: body.category, amount: String(body.amount), expenseDate,
    shiftId, note: body.note?.trim() || null };
}

export function validateExpenseFilters(query) {
  const from = query.from === undefined ? null : validateDate(query.from);
  const to = query.to === undefined ? null : validateDate(query.to);
  const category = query.category ?? null;
  if (category !== null && !expenseCategories.includes(category)) {
    throw httpError(400, 'Wybierz poprawną kategorię kosztu.');
  }
  if (from && to && from > to) throw httpError(400, 'Data od nie może być późniejsza niż data do.');
  return { from, to, category };
}
