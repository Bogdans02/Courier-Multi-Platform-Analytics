import { expenseCategories } from './expenseValidation.js';

// Suma kosztów w groszach, żeby uniknąć błędów zaokrągleń przy dodawaniu kwot.
function sumCents(expenses) {
  return expenses.reduce((sum, expense) => sum + Math.round(Number(expense.amount) * 100), 0);
}

// Podsumowanie miesiąca: ile wydano łącznie i ile kosztów.
export function expensesTotal(expenses) {
  return { amount: sumCents(expenses) / 100, count: expenses.length };
}

// Rozbicie na kategorie w stałej kolejności z listy kategorii; puste kategorie pomijamy.
export function expensesByCategory(expenses) {
  return expenseCategories
    .map(({ value, label }) => {
      const group = expenses.filter((expense) => expense.category === value);
      return { value, label, amount: sumCents(group) / 100, count: group.length };
    })
    .filter((group) => group.count > 0);
}

// Dzień powiązanej zmiany po jej id (zmiany są już pobrane w ekranie), żeby pokazać datę zamiast "#350".
export function shiftDateById(shifts) {
  const map = new Map(shifts.map((shift) => [shift.id, shift.startedAt]));
  return (shiftId) => (shiftId == null ? null : map.get(shiftId) ?? null);
}
