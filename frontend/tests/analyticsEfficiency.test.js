import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { analyticsChartData, efficiencyTrend } from '../src/utils/analyticsFormat.js';
import { getDetails } from '../src/services/api/analytics.js';

let server;
let Efficiency;
let DataTable;
before(async () => {
  server = await createServer({ server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  Efficiency = (await server.ssrLoadModule('/src/components/AnalyticsEfficiency.jsx')).default;
  DataTable = (await server.ssrLoadModule('/src/components/AnalyticsDataTable.jsx')).default;
});
after(async () => { await server?.close(); });

const selection = { kind: 'week', anchor: '2026-11-02', asOf: '2026-11-04T12:00:00.123Z' };
const range = { earliestDate: '2026-09-15', currentDate: '2026-11-04' };
const group = { shiftCount: 2, totalEarnings: '100.00', totalHours: 3,
  totalOrders: 7, earningsPerHour: '33.34', ordersPerHour: '2.34' };
function fixture() {
  return { mode: 'gross', trend: [{ ...group, key: '2026-11-02' }],
    months: [{ ...group, key: '2026-11' }],
    weekdays: [1, 2, 3, 4, 5, 6, 7].map(key => ({ ...group, key: String(key) })),
    bestWeekdays: { status: 'available', earningsPerHour: '33.34',
      days: [{ key: '1', shiftCount: 1, totalHours: 3, earningsPerHour: '33.34' }] } };
}
// The redesigned Efficiency shows only the weekday zł/h chart and the best day.
const render = (details = fixture()) => renderToStaticMarkup(createElement(Efficiency, { details }));

test('efficiency reads exact backend aggregates for each metric and distinguishes NULL samples from real zero', () => {
  const rows = [{ ...group, key: '2026-11-02' },
    { ...group, key: '2026-11-03', totalEarnings: '0.00', earningsPerHour: '0.00', ordersPerHour: '0.00' },
    { ...group, key: '2026-11-04', shiftCount: 0 },
    { ...group, key: '2026-11-05', earningsPerHour: null, ordersPerHour: null }];
  assert.deepEqual(analyticsChartData('trend', rows, 'totalEarnings').values, [100, 0, null, 100]);
  // 33.34 / 2.34 are deliberately different from recomputing the rounded sums above.
  assert.deepEqual(analyticsChartData('trend', rows, 'earningsPerHour').values, [33.34, 0, null, null]);
  assert.deepEqual(analyticsChartData('trend', rows, 'ordersPerHour').values, [2.34, 0, null, null]);
});

test('calendar labels are daily for week/month and monthly for all, including empty and future groups without invented values', () => {
  const details = fixture();
  const week = efficiencyTrend(details, selection, range);
  assert.equal(week.kind, 'trend');
  assert.equal(week.rows.length, 7);
  assert.equal(week.rows[0], details.trend[0]);
  assert.equal(week.rows.at(-1).key, '2026-11-08');
  assert.deepEqual(analyticsChartData('trend', week.rows, 'earningsPerHour').values, [33.34, null, null, null, null, null, null]);
  const month = efficiencyTrend(details, { ...selection, kind: 'month', anchor: '2026-11-01' }, range);
  assert.equal(month.rows.length, 30);
  assert.equal(month.rows[1], details.trend[0]);
  const all = efficiencyTrend(details, { ...selection, kind: 'all', anchor: null }, range);
  assert.equal(all.kind, 'months');
  assert.deepEqual(all.rows.map(row => row.key), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(analyticsChartData('months', all.rows).values, [null, null, 100]);
  const empty = efficiencyTrend({ ...details, months: [] }, { ...selection, kind: 'all' }, { ...range, earliestDate: null });
  assert.deepEqual(empty.rows.map(row => row.key), ['2026-11']);
  const warsawDate = efficiencyTrend({ ...details, months: [] }, { kind: 'all', asOf: '2026-10-31T23:30:00Z' });
  assert.equal(warsawDate.rows[0].key, '2026-11');
});

test('the weekday section shows a single zł/h chart built from the weekday aggregates', () => {
  const markup = render();
  // One chart only — the daily trend no longer duplicates here.
  assert.equal((markup.match(/<canvas /g) ?? []).length, 1);
  assert.match(markup, /Zarobek na godzinę według dnia tygodnia/);
  assert.match(markup, /według dnia tygodnia, zł\/h/);
  assert.doesNotMatch(markup, /Trend dzienny|Trend miesięczny|aria-pressed/);
});

test('best weekday displays the backend winners and ties, without ranking totals or imposing a minimum', () => {
  const details = fixture();
  details.bestWeekdays = { status: 'available', earningsPerHour: '42.60', days: [
    { key: '2', shiftCount: 1, totalHours: 0.5 }, { key: '5', shiftCount: 2, totalHours: 3.25 },
  ] };
  const markup = render(details);
  assert.match(markup, /Najlepszy dzień/);
  assert.match(markup, /Wtorek, Piątek/);
  assert.match(markup, /42,60.*?zł\/h/);
  assert.match(render(), /Poniedziałek/);
});

test('empty weekday rates, all-zero and unavailable best days remain distinct', () => {
  const details = fixture();
  details.weekdays = details.weekdays.map(day => ({ ...day, earningsPerHour: null }));
  details.bestWeekdays = { status: 'no_data', earningsPerHour: null, days: [] };
  const empty = render(details);
  assert.match(empty, /Brak danych dla tego okresu/);
  assert.doesNotMatch(empty, /<canvas /);
  const zero = fixture();
  zero.weekdays = zero.weekdays.map(day => ({ ...day, earningsPerHour: '0.00' }));
  zero.bestWeekdays = { status: 'all_zero', earningsPerHour: '0.00', days: [] };
  const zeroMarkup = render(zero);
  assert.match(zeroMarkup, /<canvas /);
  assert.match(zeroMarkup, /Brak wyróżniającego się dnia/);
  assert.doesNotMatch(zeroMarkup, /analytics-best-result/);
});

test('net mode labels the weekday chart as szacowane netto, and details platform queries share the global selection/asOf', async (t) => {
  const details = fixture();
  details.mode = 'estimated_net';
  details.bestWeekdays.earningsPerHour = '28.00';
  assert.match(render(details), /Szacowane netto/);
  assert.match(render(details), /28,00.*?zł\/h/);
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(new URL(url)); return new Response('{"details":{}}'); });
  const query = { calendar: selection.kind, anchor: selection.anchor, asOf: selection.asOf };
  await getDetails('token', query, 'all', undefined, 'estimated_net');
  await getDetails('token', query, 'wolt', undefined, 'estimated_net');
  assert.deepEqual(urls.map(url => url.searchParams.get('platform')), ['all', 'wolt']);
  for (const url of urls) {
    assert.equal(url.searchParams.get('asOf'), selection.asOf);
    assert.equal(url.searchParams.get('anchor'), selection.anchor);
    assert.equal(url.searchParams.get('calendar'), 'week');
    assert.equal(url.searchParams.get('mode'), 'estimated_net');
  }
});

test('weekly weekday metrics remain available in the existing table, without fabricated hourly platform values', () => {
  const props = { title: 'Dni tygodnia', kind: 'weekdays', rows: fixture().weekdays, mode: 'gross', platform: 'all' };
  const markup = renderToStaticMarkup(createElement(DataTable, props));
  assert.match(markup, /Poniedziałek/);
  assert.match(markup, /Czas pracy \(h\)/);
  assert.match(markup, /Zł\/h/);
  assert.match(markup, /Dostawy\/h/);
  assert.match(markup, /2,34/);
  const platform = renderToStaticMarkup(createElement(DataTable, { ...props, platform: 'wolt' }));
  assert.doesNotMatch(platform, /Czas pracy \(h\)|Zł\/h|Dostawy\/h/);
  assert.match(platform, /Zamówienia/);
});
