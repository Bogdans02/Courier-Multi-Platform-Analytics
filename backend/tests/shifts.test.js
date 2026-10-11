import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateShiftId, validateShiftUpdate } from '../src/validators/shiftValidator.js';

const valid = { startedAt: '2026-10-10T08:00:00.000Z', endedAt: '2026-10-10T10:30:00.000Z' };

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
