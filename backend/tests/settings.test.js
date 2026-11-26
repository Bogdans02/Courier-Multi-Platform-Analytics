import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSettings, validateTransport, validateDailyGoal, transportTypes } from '../src/validators/settingsValidator.js';

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

test('transport defaults to no fuel model, needs both fuel params for vehicles and rejects fuel for bike/foot', () => {
  const none = { transportType: null, fuelPer100km: null, fuelPricePerL: null };
  // Brak typu = brak modelu paliwa.
  for (const body of [undefined, {}, { transportType: '' }, { transportType: null }]) {
    assert.deepEqual(validateTransport(body), none);
  }
  assert.throws(() => validateTransport({ transportType: 'plane' }), { status: 400 });
  // Rower i pieszo: bez paliwa; podanie paliwa to błąd.
  for (const transportType of ['bike', 'foot']) {
    assert.deepEqual(validateTransport({ transportType }), { transportType, fuelPer100km: null, fuelPricePerL: null });
    assert.throws(() => validateTransport({ transportType, fuelPer100km: '5' }), { status: 400 });
    assert.throws(() => validateTransport({ transportType, fuelPricePerL: '6' }), { status: 400 });
  }
  // Pojazd spalinowy: oba parametry wymagane, nieujemne, z ograniczeniem miejsc po przecinku.
  for (const bad of [{}, { fuelPer100km: '5' }, { fuelPricePerL: '6' },
    { fuelPer100km: '-1', fuelPricePerL: '6' }, { fuelPer100km: '5.123', fuelPricePerL: '6' },
    { fuelPer100km: '5', fuelPricePerL: '6.1234' }, { fuelPer100km: 'NaN', fuelPricePerL: '6' }]) {
    assert.throws(() => validateTransport({ transportType: 'car', ...bad }), { status: 400 });
  }
  assert.deepEqual(validateTransport({ transportType: 'car', fuelPer100km: '7.5', fuelPricePerL: 6 }),
    { transportType: 'car', fuelPer100km: '7.50', fuelPricePerL: '6.000' });
  assert.equal(transportTypes.find(({ value }) => value === 'bike').fuel, false);
});

test('daily goal is optional, non-negative with grosze, and rejects malformed values', () => {
  // Brak celu: null/''/undefined daje null.
  for (const body of [undefined, {}, { dailyGoal: null }, { dailyGoal: '' }]) {
    assert.deepEqual(validateDailyGoal(body), { dailyGoal: null });
  }
  // Prawidłowa wartość normalizuje się do dwóch miejsc po przecinku.
  assert.deepEqual(validateDailyGoal({ dailyGoal: '200' }), { dailyGoal: '200.00' });
  assert.deepEqual(validateDailyGoal({ dailyGoal: 150.5 }), { dailyGoal: '150.50' });
  assert.deepEqual(validateDailyGoal({ dailyGoal: '0' }), { dailyGoal: '0.00' });
  // Błędne: ujemne, za dużo miejsc, nieliczba.
  for (const dailyGoal of ['-10', '12.345', 'abc', 'NaN', true]) {
    assert.throws(() => validateDailyGoal({ dailyGoal }), { status: 400 });
  }
});
