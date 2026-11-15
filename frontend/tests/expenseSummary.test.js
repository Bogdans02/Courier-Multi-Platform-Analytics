import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expensesByCategory, expensesTotal, shiftDateById } from '../src/utils/expenseSummary.js';

const expenses = [
  { id: 1, category: 'fuel', amount: '50.00', shiftId: 10 },
  { id: 2, category: 'fuel', amount: '30.10', shiftId: null },
  { id: 3, category: 'phone', amount: '19.99', shiftId: 11 },
];

test('month total sums amounts in cents and counts the expenses', () => {
  assert.deepEqual(expensesTotal(expenses), { amount: 100.09, count: 3 });
  assert.deepEqual(expensesTotal([]), { amount: 0, count: 0 });
});

test('category breakdown keeps the fixed order and drops empty categories', () => {
  const groups = expensesByCategory(expenses);
  // fuel idzie przed phone (kolejność z listy kategorii), kategorie bez kosztów znikają.
  assert.deepEqual(groups.map(({ value }) => value), ['fuel', 'phone']);
  assert.deepEqual(groups[0], { value: 'fuel', label: 'Paliwo', amount: 80.1, count: 2 });
  assert.deepEqual(groups[1], { value: 'phone', label: 'Telefon', amount: 19.99, count: 1 });
  assert.deepEqual(expensesByCategory([]), []);
});

test('shift date lookup returns the start time by id, or null without a link', () => {
  const dateOf = shiftDateById([{ id: 10, startedAt: '2026-11-05T10:00:00.000Z' }]);
  assert.equal(dateOf(10), '2026-11-05T10:00:00.000Z');
  assert.equal(dateOf(999), null);
  assert.equal(dateOf(null), null);
});
