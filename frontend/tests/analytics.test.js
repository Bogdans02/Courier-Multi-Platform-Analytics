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

test('calendar API uses the server normalized selection and identical asOf for details, with a fresh summary on refresh', async (t) => {
  const requests = [];
  const moments = ['2026-11-04T12:00:00.123Z', '2026-11-04T12:01:00.456Z'];
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    const parsed = new URL(url);
    requests.push(parsed);
    assert.equal(parsed.searchParams.get('period'), null);
    assert.equal(parsed.searchParams.get('mode'), 'estimated_net');
    if (parsed.pathname.endsWith('/summary')) {
      assert.equal(parsed.searchParams.get('asOf'), null);
      return new Response(JSON.stringify({ summary: { selection: {
        kind: 'week', anchor: '2026-11-02', asOf: moments[reads++],
      } } }));
    }
    return new Response(JSON.stringify({ details: {} }));
  });
  for (const moment of moments) {
    const { summary } = await getSummary('token', { calendar: 'week', anchor: '2026-11-04' }, undefined, 'estimated_net');
    const { kind: calendar, anchor, asOf } = summary.selection;
    await getDetails('token', { calendar, anchor, asOf }, 'wolt', undefined, 'estimated_net');
    const query = requests.at(-1).searchParams;
    assert.equal(query.get('calendar'), 'week');
    assert.equal(query.get('anchor'), '2026-11-02');
    assert.equal(query.get('asOf'), moment);
    assert.equal(query.get('platform'), 'wolt');
  }
  assert.equal(reads, 2);
});

test('calendar all never sends anchor or legacy period, including the shared-time details request', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(new URL(url)); return new Response('{}'); });
  await getSummary('token', { calendar: 'all', anchor: '2026-11-04' });
  await getDetails('token', { calendar: 'all', anchor: null, asOf: '2026-11-04T12:00:00Z' }, 'all');
  for (const url of urls) {
    assert.equal(url.searchParams.get('calendar'), 'all');
    assert.equal(url.searchParams.get('anchor'), null);
    assert.equal(url.searchParams.get('period'), null);
  }
  assert.equal(urls[1].searchParams.get('asOf'), '2026-11-04T12:00:00Z');
});

test('obsolete calendar requests reject even if a delayed response arrives after cancellation', async (t) => {
  let releaseOld;
  let reads = 0;
  t.mock.method(globalThis, 'fetch', () => ++reads === 1 ? new Promise(resolve => { releaseOld = resolve; })
    : Promise.resolve(new Response(JSON.stringify({ summary: { marker: 'new' } }))));
  const controller = new AbortController();
  const old = getSummary('token', { calendar: 'week', anchor: '2026-10-19' }, controller.signal);
  controller.abort();
  const current = await getSummary('token', { calendar: 'week', anchor: '2026-10-26' });
  assert.equal(current.summary.marker, 'new');
  releaseOld(new Response(JSON.stringify({ summary: { marker: 'old' } })));
  await assert.rejects(old, { name: 'AbortError' });
});

test('details retry keeps the summary selection and asOf while preserving its failure', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(url);
    return urls.length === 1 ? new Response(JSON.stringify({ message: 'Błąd wykresów.' }), { status: 503 })
      : new Response(JSON.stringify({ details: { marker: 'retried' } }));
  });
  const selection = { calendar: 'month', anchor: '2026-11-01', asOf: '2026-11-04T12:00:00.123Z' };
  await assert.rejects(getDetails('token', selection, 'all'), { status: 503, message: 'Błąd wykresów.' });
  assert.equal((await getDetails('token', selection, 'all')).details.marker, 'retried');
  assert.equal(urls[0], urls[1]);
});
