import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateExpense, validateExpenseFilters, validateExpenseId, expenseCategories } from '../src/validators/expenseValidator.js';

const valid = { category: 'fuel', amount: '12.30', expenseDate: '2026-10-14' };

test('expense validation accepts exactly the approved categories and optional note and shift', () => {
  assert.deepEqual(expenseCategories, ['fuel', 'vehicle_service', 'vehicle_rental', 'phone', 'other']);
  for (const category of expenseCategories) {
    assert.deepEqual(validateExpense({ ...valid, category, user_id: 999 }), {
      ...valid, category, shiftId: null, note: null,
    });
  }
  assert.deepEqual(validateExpense({ ...valid, amount: 0, shiftId: '12', note: ' test ' }), {
    ...valid, amount: '0', shiftId: 12, note: 'test',
  });
  assert.equal(validateExpense({ ...valid, note: '  ' }).note, null);
});

test('expense validation rejects malformed amounts, dates, categories, notes and identifiers', () => {
  for (const body of [null, {}, { ...valid, category: 'insurance' }, ...[-1, '1.001', 'NaN', '', false, [], '10000000000'].map((amount) => ({ ...valid, amount })),
    ...['2026-02-29', '2026-04-31', '14.10.2026', '0000-01-01', '', ['2026-10-14']].map((expenseDate) => ({ ...valid, expenseDate })),
    { ...valid, note: 123 }, ...[-1, 0, 1.5, 'abc', 2147483648, [1], true].map((shiftId) => ({ ...valid, shiftId }))]) {
    assert.throws(() => validateExpense(body), { status: 400 });
  }
  assert.equal(validateExpenseId('2147483647'), 2147483647);
});

test('expense history validates inclusive date bounds and category filters', () => {
  assert.deepEqual(validateExpenseFilters({}), { from: null, to: null, category: null });
  assert.deepEqual(validateExpenseFilters({ from: '2024-02-29', to: '2024-02-29', category: 'phone' }), {
    from: '2024-02-29', to: '2024-02-29', category: 'phone',
  });
  for (const query of [{ from: '2026-10-15', to: '2026-10-14' }, { from: 'invalid' }, { category: 'unknown' },
    { category: ['fuel', 'other'] }, { to: ['2026-10-14'] }]) {
    assert.throws(() => validateExpenseFilters(query), { status: 400 });
  }
});
