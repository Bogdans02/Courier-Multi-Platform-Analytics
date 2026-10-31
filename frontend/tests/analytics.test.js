import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSummary, getDetails } from '../src/services/api/analytics.js';
import { analyticsChartData, analyticsLabel, analyticsAxisLabel } from '../src/utils/analyticsFormat.js';

test('analytics API requests estimated net for both summary and chart data without sending a client rate', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    return new Response(JSON.stringify({}));
  });
  await getSummary('token', 'all', undefined, 'estimated_net');
  await getDetails('token', 'month', 'glovo', undefined, 'estimated_net');
  assert.match(urls[0], /summary\?period=all&mode=estimated_net$/);
  assert.match(urls[1], /details\?period=month&platform=glovo&mode=estimated_net$/);
});

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

test('details API sends both filters, authorization and cancellation and preserves errors', async (t) => {
  const controller = new AbortController();
  const details = { trend: [{ key: '2026-10-01', totalEarnings: '0.30' }] };
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /\/analytics\/details\?period=month&platform=bolt_food$/);
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.equal(options.signal, controller.signal);
    return new Response(JSON.stringify({ details }));
  });
  assert.deepEqual(await getDetails('token', 'month', 'bolt_food', controller.signal), { details });
  for (const status of [400, 401, 500]) {
    mock.mock.mockImplementation(async () => new Response(JSON.stringify({ message: 'Błąd wykresów.' }), { status }));
    await assert.rejects(getDetails('token', 'all', 'all'), { status, message: 'Błąd wykresów.' });
  }
  mock.mock.mockImplementation(async () => { throw new TypeError('network'); });
  await assert.rejects(getDetails('token', 'all', 'all'), /Nie można połączyć/);
  controller.abort();
  mock.mock.mockImplementation(async () => { throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(getDetails('token', 'all', 'all', controller.signal), { name: 'AbortError' });
});

test('chart presentation keeps backend day keys, distinguishes missing samples from zero and labels all groups', () => {
  assert.deepEqual(analyticsChartData('trend', [
    { key: '2026-10-01', shiftCount: 1, totalEarnings: '0.00' },
    { key: '2026-10-02', shiftCount: 0, totalEarnings: '0.00' },
  ]), { labels: ['01.10.2026', '02.10.2026'], values: [0, null] });
  assert.equal(analyticsLabel('weekdays', { key: '1' }), 'Poniedziałek');
  assert.equal(analyticsLabel('weekdays', { key: '7' }), 'Niedziela');
  assert.equal(analyticsLabel('startTimes', { key: '0' }), '00:00–06:00');
  assert.equal(analyticsLabel('startTimes', { key: '3' }), '18:00–24:00');
  assert.equal(analyticsLabel('months', { key: '2026-01' }), '2026-01');
  assert.equal(analyticsLabel('platforms', { platform: 'bolt_food' }), 'Bolt Food');
  assert.equal(analyticsLabel('platforms', { platform: 'pyszne_pl' }), 'Pyszne.pl');
  assert.equal(analyticsLabel('platforms', { platform: 'wolt' }), 'Wolt');
});

test('mobile axes shorten labels while keeping complete table labels and chart amounts', () => {
  assert.equal(analyticsAxisLabel('01.10.2026'), '01.10');
  assert.equal(analyticsAxisLabel('Poniedziałek'), 'pon.');
  assert.equal(analyticsAxisLabel('Środa'), 'śr.');
  assert.equal(analyticsAxisLabel('2026-10'), '10.2026');
  assert.deepEqual(analyticsAxisLabel('06:00–12:00'), ['06:00–', '12:00']);
  assert.equal(analyticsLabel('weekdays', { key: '1' }), 'Poniedziałek');
  const homeLabel = ['26.10', 'pon.'];
  assert.deepEqual(analyticsAxisLabel(homeLabel), homeLabel);
  const row = { key: '1', shiftCount: 1, totalEarnings: '0.00' };
  assert.deepEqual(analyticsChartData('weekdays', [row]), { labels: ['Poniedziałek'], values: [0] });
});
