import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSummary } from '../src/services/api/analytics.js';

test('summary API sends the selected period, Bearer token and abort signal and returns server metrics', async (t) => {
  const signal = new AbortController().signal;
  const summary = { totalEarnings: '400.00', earningsPerKm: null };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /\/analytics\/summary\?period=three_months$/);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.signal, signal);
    return new Response(JSON.stringify({ summary }));
  });
  assert.deepEqual(await getSummary('test-token', 'three_months', signal), { summary });
});

test('summary API preserves validation and session errors, reports connection failures and supports abort', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch');
  for (const status of [400, 401, 500]) {
    mock.mock.mockImplementation(async () => new Response(JSON.stringify({ message: 'Czytelny błąd.' }), { status }));
    await assert.rejects(getSummary('token', 'week'), { status, message: 'Czytelny błąd.' });
  }
  mock.mock.mockImplementation(async () => { throw new TypeError('network failure'); });
  await assert.rejects(getSummary('token', 'all'), /Nie można połączyć/);
  mock.mock.mockImplementation(async () => new Response('invalid JSON'));
  await assert.rejects(getSummary('token', 'all'), /nieprawidłową odpowiedź/);
  const controller = new AbortController();
  controller.abort();
  mock.mock.mockImplementation(async () => { throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(getSummary('token', 'all', controller.signal), { name: 'AbortError' });
});
