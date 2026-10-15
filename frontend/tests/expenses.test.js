import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expensePayload, expenseCategories, validateExpenseFilters } from '../src/utils/expenseValidation.js';
import { getExpenses, createExpense, updateExpense, deleteExpense } from '../src/services/api/expenses.js';

test('expense form validates amounts and dates, supports decimal comma and normalizes optional fields', () => {
  const valid = { category: 'fuel', amount: '12,30', expenseDate: '2026-10-14', shiftId: '', note: '  ' };
  assert.equal(expenseCategories.length, 5);
  assert.deepEqual(expensePayload(valid), { category: 'fuel', amount: '12.30', expenseDate: '2026-10-14', shiftId: null, note: null });
  assert.equal(expensePayload({ ...valid, amount: '0', shiftId: '2', note: ' note ' }).note, 'note');
  assert.equal(expensePayload({ ...valid, shiftId: '2' }).shiftId, 2);
  for (const values of [{ ...valid, category: '' }, { ...valid, category: 'unknown' },
    ...['', '-1', '0.001', 'NaN', '10000000000'].map((amount) => ({ ...valid, amount })),
    ...['2026-02-29', '2026-04-31', '0000-01-01', ''].map((expenseDate) => ({ ...valid, expenseDate })),
    { ...valid, shiftId: '-1' }, { ...valid, shiftId: '2147483648' }]) assert.throws(() => expensePayload(values));
  assert.deepEqual(validateExpenseFilters({ from: '2024-02-29', to: '2024-02-29' }), { from: '2024-02-29', to: '2024-02-29' });
  assert.throws(() => validateExpenseFilters({ from: '2026-10-15', to: '2026-10-14' }));
  assert.throws(() => validateExpenseFilters({ from: 'bad', to: '' }));
});

test('expense API sends filters, Bearer token, payload and correct CRUD methods', async (t) => {
  const signal = new AbortController().signal;
  const body = { category: 'phone', amount: '10.00', expenseDate: '2026-10-14', shiftId: null, note: null };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer token');
    calls.push({ url, ...options });
    return options.method === 'DELETE' ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ expenses: [], expense: { id: 7, ...body } }));
  });
  await getExpenses('token', { from: '2026-10-01', to: '', category: 'phone' }, signal);
  assert.match(calls[0].url, /\/expenses\?from=2026-10-01&category=phone$/);
  assert.equal(calls[0].signal, signal);
  await createExpense('token', body);
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].body), body);
  await updateExpense('token', 7, body);
  assert.match(calls[2].url, /\/expenses\/7$/);
  assert.equal(calls[2].method, 'PUT');
  assert.equal(await deleteExpense('token', 7), undefined);
  assert.equal(calls[3].method, 'DELETE');
});

test('expense API preserves validation, session and ownership errors, and handles connection failures and abort', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch');
  for (const status of [400, 401, 404, 500]) {
    mock.mock.mockImplementation(async () => new Response(JSON.stringify({ message: 'Błąd kosztu.' }), { status }));
    await assert.rejects(getExpenses('token'), { status, message: 'Błąd kosztu.' });
  }
  mock.mock.mockImplementation(async () => new Response('not JSON'));
  await assert.rejects(getExpenses('token'), /nieprawidłową odpowiedź/);
  mock.mock.mockImplementation(async () => { throw new TypeError('network'); });
  await assert.rejects(getExpenses('token'), /Nie można połączyć/);
  const controller = new AbortController();
  controller.abort();
  mock.mock.mockImplementation(async () => { throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(getExpenses('token', {}, controller.signal), { name: 'AbortError' });
});
