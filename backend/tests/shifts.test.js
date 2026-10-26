import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePlatformEntries, validateShiftId, validateShiftUpdate } from '../src/validators/shiftValidator.js';

const entry = { platform: 'glovo', earningsGross: '160.50', ordersCount: 10 };
const valid = { startedAt: '2026-10-10T08:00:00.000Z', endedAt: '2026-10-10T10:30:00.000Z', platformEntries: [entry] };

test('shift update validates time order and preserves optional manual distance', () => {
  const values = validateShiftUpdate(valid);
  assert.equal(values.startedAt.toISOString(), valid.startedAt);
  assert.equal(values.endedAt.toISOString(), valid.endedAt);
  assert.equal(values.distanceKm, null);
  assert.equal(validateShiftUpdate({ ...valid, distanceKm: '64.50' }).distanceKm, '64.50');
  assert.equal(validateShiftUpdate({ ...valid, distanceKm: 0 }).distanceKm, '0');
  for (const body of [null, {}, { ...valid, endedAt: valid.startedAt },
    { ...valid, startedAt: '2026-02-30T08:00:00.000Z' },
    { ...valid, startedAt: '2026-10-10T08:00:00' },
    ...[-1, 'abc', '', true, '1.234', '100000000'].map((distanceKm) => ({ ...valid, distanceKm }))]) {
    assert.throws(() => validateShiftUpdate(body), { status: 400 });
  }
});

test('shift IDs must fit a positive PostgreSQL integer', () => {
  assert.equal(validateShiftId('42'), 42);
  for (const value of ['0', '-1', '1.5', 'abc', '2147483648']) {
    assert.throws(() => validateShiftId(value), { status: 400 });
  }
});

test('platform entries accept one or several platforms and normalize money and integer orders', () => {
  assert.deepEqual(validatePlatformEntries([entry]), [entry]);
  assert.deepEqual(validatePlatformEntries([entry, { platform: 'bolt_food', earningsGross: 0, ordersCount: '0' }]),
    [entry, { platform: 'bolt_food', earningsGross: '0', ordersCount: 0 }]);
  assert.equal(validateShiftUpdate(valid).platformEntries.length, 1);
  const entries = ['glovo', 'bolt_food', 'uber_eats', 'pyszne_pl', 'wolt', 'other']
    .map((platform) => ({ ...entry, platform }));
  assert.deepEqual(validateShiftUpdate({ ...valid, platformEntries: entries }).platformEntries, entries);
});

test('platform validation rejects missing entries, duplicates, unknown platforms and invalid values', () => {
  const invalid = [undefined, null, {}, [], Array(7).fill(entry), [entry, entry], [{ ...entry, platform: 'unknown' }], [null],
    ...[-1, '', true, '1.234', '10000000000'].map((earningsGross) => [{ ...entry, earningsGross }]),
    ...[-1, '', true, 1.5, '2147483648'].map((ordersCount) => [{ ...entry, ordersCount }])];
  for (const entries of invalid) assert.throws(() => validatePlatformEntries(entries), { status: 400 });
});
