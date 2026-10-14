import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSettings } from '../src/validators/settingsValidator.js';

test('accepted profiles derive their rates on the server and PPK affects only two profiles', () => {
  for (const [netProfile, withoutPpk, withPpk] of [
    ['student_under_26', '0.00000', '0.00000'],
    ['employed_under_26', '0.09000', '0.09000'],
    ['unemployed_under_26', '0.19250', '0.21250'],
    ['employed_26_plus', '0.18720', '0.18720'],
    ['unemployed_26_plus', '0.27820', '0.29820'],
  ]) {
    for (const [ppkOptOut, expected] of [[true, withoutPpk], [false, withPpk]]) {
      const result = validateSettings({ netProfile, ppkOptOut, deductionRate: '1', user_id: 999 });
      assert.equal(result.deductionRate, expected);
      assert.equal(result.ppkOptOut, netProfile.startsWith('unemployed') ? ppkOptOut : null);
      assert.equal('user_id' in result, false);
    }
  }
});

test('settings validate profile, explicit PPK choice and custom fractional rate without rounding input', () => {
  for (const body of [null, {}, [], { netProfile: 'unknown' },
    { netProfile: 'unemployed_under_26' }, { netProfile: 'unemployed_26_plus', ppkOptOut: 'false' }]) {
    assert.throws(() => validateSettings(body), { status: 400 });
  }
  for (const deductionRate of [undefined, null, '', ' ', -0.01, 1.01, false, [], {}, 'NaN', 'Infinity', '0.123456', '1e-2']) {
    assert.throws(() => validateSettings({ netProfile: 'custom', deductionRate }), { status: 400 });
  }
  for (const deductionRate of [0, 1, '0.12345']) {
    assert.deepEqual(validateSettings({ netProfile: 'custom', deductionRate, ppkOptOut: false }), {
      netProfile: 'custom', deductionRate: Number(deductionRate).toFixed(5), ppkOptOut: null,
    });
  }
});
