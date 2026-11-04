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
const render = (details = fixture(), chosen = selection, metricKey = 'totalEarnings') =>
  renderToStaticMarkup(createElement(Efficiency, { details, selection: chosen, availableRange: range,
    metricKey, onMetricChange() {} }));

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

test('React shows one weekly trend, weekday analysis for month/all, and changes both chart units with the shared metric control', () => {
  for (const [kind, anchor, expectedTrend, charts] of [['week', '2026-11-02', 'Trend dzienny', 1],
    ['month', '2026-11-01', 'Trend dzienny', 2], ['all', null, 'Trend miesięczny', 2]]) {
    for (const [metric, label, unit] of [['totalEarnings', 'Zarobek', 'zł'], ['earningsPerHour', 'Zł/h', 'zł/h'],
      ['ordersPerHour', 'Dostawy/h', 'dostawy/h']]) {
      const markup = render(fixture(), { ...selection, kind, anchor }, metric);
      assert.equal((markup.match(/<canvas /g) ?? []).length, charts);
      assert.match(markup, new RegExp(`${expectedTrend} — ${label}, ${unit}`));
      assert.match(markup, new RegExp(`aria-pressed="true">${label}</button>`));
      if (kind === 'week') assert.doesNotMatch(markup, /Wyniki według dnia tygodnia/);
      else assert.match(markup, new RegExp(`Wyniki według dnia tygodnia — ${label}, ${unit}`));
      assert.match(markup, /Wszystkie platformy/);
    }
  }
  let picked;
  const element = Efficiency({ details: fixture(), selection, availableRange: range,
    metricKey: 'totalEarnings', onMetricChange: key => { picked = key; } });
  element.props.children[0].props.children[2].props.onClick();
  assert.equal(picked, 'ordersPerHour');
});

test('best weekday displays the backend winners and ties with sample information, without ranking totals or imposing a minimum', () => {
  const details = fixture();
  details.bestWeekdays = { status: 'available', earningsPerHour: '42.60', days: [
    { key: '2', shiftCount: 1, totalHours: 0.5 }, { key: '5', shiftCount: 2, totalHours: 3.25 },
  ] };
  const markup = render(details);
  assert.match(markup, /Wtorek, Piątek/);
  assert.match(markup, /42,60.*?zł\/h/);
  assert.match(markup, /Wtorek: liczba zmian 1, czas pracy 0,5 godz/);
  assert.match(markup, /Piątek: liczba zmian 2, czas pracy 3,25 godz/);
  assert.match(markup, /aria-label="Informacje o najlepszym dniu"/);
  assert.match(render(), /Poniedziałek/);
});

test('empty metrics, actual zero rates, all-zero best days and unavailable best days remain distinct', () => {
  const details = fixture();
  details.trend = [{ ...details.trend[0], earningsPerHour: null }];
  details.bestWeekdays = { status: 'no_data', earningsPerHour: null, days: [] };
  const empty = render(details, selection, 'earningsPerHour');
  assert.match(empty, /Brak danych dla wybranej metryki/);
  assert.doesNotMatch(empty, /<canvas /);
  details.trend[0].earningsPerHour = '0.00';
  details.bestWeekdays = { status: 'all_zero', earningsPerHour: '0.00', days: [] };
  const zero = render(details, selection, 'earningsPerHour');
  assert.match(zero, /<canvas /);
  assert.match(zero, /Brak wyróżniającego się dnia/);
  assert.doesNotMatch(zero, /analytics-best-result/);
});

test('financial mode uses server rates while orders/h remains independent, and details platform queries share the global selection/asOf', async (t) => {
  const details = fixture();
  details.mode = 'estimated_net';
  details.bestWeekdays.earningsPerHour = '28.00';
  assert.match(render(details, selection, 'earningsPerHour'), /zł\/h, szacowane netto/);
  assert.match(render(details), /28,00.*?zł\/h/);
  assert.match(render(details, selection, 'ordersPerHour'), /Dostawy\/h, dostawy\/h"/);
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
