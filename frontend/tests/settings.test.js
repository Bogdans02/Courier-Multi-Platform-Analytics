import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSettings, saveSettings } from '../src/services/api/settings.js';
import { settingsPayload, estimatedRate, formatRate } from '../src/utils/netSettings.js';

test('settings validate custom percentages, support decimal comma and keep PPK separate from profiles', () => {
  const profiles = [{ value: 'student', deductionRate: '0.00000' },
    { value: 'unemployed', deductionRate: '0.19250', ppkDeductionRate: '0.21250' }, { value: 'custom' }];
  assert.equal(estimatedRate(profiles, 'student', false, ''), '0.00000');
  assert.equal(estimatedRate(profiles, 'unemployed', true, ''), '0.19250');
  assert.equal(estimatedRate(profiles, 'unemployed', false, ''), '0.21250');
  assert.equal(estimatedRate(profiles, '', false, ''), null);
  for (const percent of ['', ' ', '-1', '100.001', '12.1234', 'NaN', 'Infinity', '1e1']) {
    assert.throws(() => settingsPayload(profiles, 'custom', false, percent));
  }
  for (const [percent, deductionRate] of [['0', '0.00000'], ['100', '1.00000'], ['12,345', '0.12345']]) {
    assert.deepEqual(settingsPayload(profiles, 'custom', true, percent), {
      netProfile: 'custom', deductionRate, ppkOptOut: null,
    });
    assert.equal(estimatedRate(profiles, 'custom', false, percent), deductionRate);
  }
  assert.equal(formatRate('0.19250'), '19,25%');
  assert.deepEqual(settingsPayload(profiles, 'student', true, ''), { netProfile: 'student', ppkOptOut: null });
});

test('settings API reads and saves protected settings and preserves actionable errors and cancellation', async (t) => {
  const signal = new AbortController().signal;
  const data = { settings: { netProfile: 'custom', deductionRate: '0.10000' }, profiles: [] };
  const body = { netProfile: 'custom', deductionRate: '0.1', ppkOptOut: null };
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /\/settings$/);
    assert.equal(options.headers.Authorization, 'Bearer token');
    if (options.method === 'PUT') assert.deepEqual(JSON.parse(options.body), body);
    else assert.equal(options.signal, signal);
    return new Response(JSON.stringify(data));
  });
  assert.deepEqual(await getSettings('token', signal), data);
  assert.deepEqual(await saveSettings('token', body), data);
  for (const status of [400, 401, 500]) {
    mock.mock.mockImplementation(async () => new Response(JSON.stringify({ message: 'Błąd ustawień.' }), { status }));
    await assert.rejects(saveSettings('token', body), { status, message: 'Błąd ustawień.' });
  }
  mock.mock.mockImplementation(async () => { throw new TypeError('network'); });
  await assert.rejects(getSettings('token'), /Nie można połączyć/);
  mock.mock.mockImplementation(async () => new Response('not JSON'));
  await assert.rejects(getSettings('token'), /nieprawidłową odpowiedź/);
  const controller = new AbortController();
  controller.abort();
  mock.mock.mockImplementation(async () => { throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(getSettings('token', controller.signal), { name: 'AbortError' });
});
