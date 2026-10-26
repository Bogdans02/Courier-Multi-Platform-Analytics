import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultEarningsMode, shiftEarnings } from '../src/utils/earningsMode.js';

test('initial mode requires both settings, including valid zero and 100% rates', () => {
  for (const deductionRate of [0, '0.00000', '0.19250', '1.00000']) {
    assert.equal(defaultEarningsMode({ netProfile: 'custom', deductionRate }), 'estimated_net');
  }
  for (const settings of [{ netProfile: null, deductionRate: null },
    { netProfile: 'custom', deductionRate: null }, { netProfile: null, deductionRate: '0' }]) {
    assert.equal(defaultEarningsMode(settings), 'gross');
  }
});

test('shift cards use the exact server amount and can explicitly fall back to gross on a settings failure', () => {
  const shift = { totalEarnings: '235.70', estimatedNetEarnings: '190.33' };
  assert.deepEqual(shiftEarnings(shift), { amount: '190.33', label: 'szac. netto' });
  assert.deepEqual(shiftEarnings(shift, 'gross'), { amount: '235.70', label: 'brutto' });
  assert.deepEqual(shiftEarnings({ ...shift, estimatedNetEarnings: '0.00' }), { amount: '0.00', label: 'szac. netto' });
  assert.deepEqual(shiftEarnings({ ...shift, estimatedNetEarnings: null }), { amount: '235.70', label: 'brutto' });
});
