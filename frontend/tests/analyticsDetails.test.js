import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { platforms } from '../src/utils/platformEntries.js';

let server;
let Details;
before(async () => {
  server = await createServer({ server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  Details = (await server.ssrLoadModule('/src/components/AnalyticsDetails.jsx')).default;
});
after(async () => { await server?.close(); });

const views = ['trend', 'weekdays', 'months', 'startTimes', 'platforms'];
function fixture() {
  const group = { shiftCount: 2, totalEarnings: '123.45', totalOrders: 7, totalHours: 3,
    earningsPerOrder: '17.64', earningsPerHour: '41.16', ordersPerHour: '2.34' };
  return { summary: { mode: 'gross', shiftCount: 2, distanceShiftCount: 1, totalDistance: '50.00',
    totalExpenses: '15.00', earningsPerShift: '200.00', earningsPerOrder: '20.00' },
    result: { status: 'success', retry() {}, details: { mode: 'gross',
      trend: [{ ...group, key: '2026-11-01' }], weekdays: [{ ...group, key: '1' }],
      months: [{ ...group, key: '2026-11' }], startTimes: [{ ...group, key: '1' }],
      platforms: [{ ...group, platform: 'glovo', earningsShare: '60.01', ordersShare: '55.55' }] } },
    platform: 'all', onPlatformChange() {}, tableKind: 'trend', onTableKindChange() {}, calendar: 'week' };
}
const render = props => renderToStaticMarkup(createElement(Details, props ?? fixture()));
const table = markup => markup.match(/<table[\s\S]*?<\/table>/)[0];

test('one initially collapsed details section contains five additional metrics once and preserves their global scope', () => {
  const markup = render();
  assert.match(markup, /^<details class="analytics-disclosure" id="detailed-analytics">/);
  assert.equal((markup.match(/<details /g) ?? []).length, 1);
  assert.doesNotMatch(markup, /<details[^>]*\sopen|Pozostałe analizy|additional-analytics/);
  for (const label of ['Średni zarobek na zmianę', 'Średni zarobek na zamówienie', 'Liczba zmian', 'Łączny dystans', 'Łączne koszty w okresie']) {
    assert.equal(markup.split(label).length - 1, 1);
  }
  assert.match(markup, /200,00/);
  assert.match(markup, /20,00/);
  assert.match(markup, /50 km/);
  assert.match(markup, /15,00/);
  assert.match(markup, /dodatkowe wskaźniki pozostają globalne/);
  assert.match(markup, /Dystans: 1 z 2 zmian/);
  assert.doesNotMatch(markup, /analytics-kpis|Stawka \/ km|Zarobek \/ h/);
});

test('all five analyses keep their selected backend rows, complete metrics and the shared keyboard-focusable table', () => {
  const props = fixture();
  const original = structuredClone(props.result.details);
  const labels = ['01.11.2026', 'Poniedziałek', '2026-11', '06:00–12:00', 'Glovo'];
  views.forEach((kind, index) => {
    const markup = render({ ...props, tableKind: kind });
    for (const key of views) assert.match(markup, new RegExp(`<option value="${key}"`));
    assert.match(markup, new RegExp(`<option value="${kind}" selected`));
    assert.match(markup, /role="region" aria-label="Tabela:[^"]*" tabindex="0"/);
    assert.equal((markup.match(/<table /g) ?? []).length, 1);
    assert.ok(table(markup).includes(labels[index]));
    for (const value of ['123,45', '17,64', '>7<', '>2<']) assert.ok(table(markup).includes(value));
    if (kind === 'platforms') {
      assert.match(table(markup), /60,01%/);
      assert.match(table(markup), /55,55%/);
    } else {
      assert.match(table(markup), /Czas pracy \(h\)/);
      assert.match(table(markup), /41,16/);
      assert.match(table(markup), /2,34/);
    }
  });
  assert.deepEqual(props.result.details, original);
});

test('contextual charts preserve analyses missing from the main view without repeating global efficiency or platform charts', () => {
  const charts = { week: [0, 1, 1, 1, 0], month: [0, 0, 1, 1, 0], all: [1, 0, 0, 1, 0] };
  for (const [calendar, counts] of Object.entries(charts)) {
    views.forEach((kind, index) => {
      const markup = render({ ...fixture(), calendar, tableKind: kind });
      assert.equal((markup.match(/<canvas /g) ?? []).length, counts[index], `${calendar}/${kind}`);
      assert.equal((markup.match(/<table /g) ?? []).length, 1);
    });
  }
  const start = render({ ...fixture(), tableKind: 'startTimes' });
  assert.match(start, /nie zarobki uzyskane w tych godzinach/);
  assert.match(start, /Start o 06:00 należy do 06:00–12:00/);
});

test('platform filters retain assignable earnings/orders and suppress hourly columns; platform comparison explicitly remains global', () => {
  for (const platform of platforms) {
    const markup = render({ ...fixture(), platform: platform.value });
    assert.match(markup, new RegExp(`value="${platform.value}" selected`));
    assert.match(table(markup), /123,45/);
    assert.match(table(markup), /Zamówienia/);
    assert.doesNotMatch(table(markup), /Czas pracy \(h\)|Zł\/h|Dostawy\/h|Zł\/km/);
    assert.equal((markup.match(/<canvas /g) ?? []).length, 1);
  }
  const comparison = render({ ...fixture(), platform: 'wolt', tableKind: 'platforms' });
  assert.match(comparison, /<select id="analytics-platform" disabled=""><option value="all" selected/);
  assert.match(comparison, /Wszystkie platformy w wybranym okresie/);
  assert.match(table(comparison), /Udział zarobków/);
  assert.equal((comparison.match(/<canvas /g) ?? []).length, 0);
});

test('summary and table formatting keep actual zero, missing distance, NULL ratios and empty groups distinct, including an expense-only period', () => {
  const props = fixture();
  Object.assign(props.summary, { shiftCount: 0, distanceShiftCount: 0, totalDistance: '0.00', earningsPerShift: null, earningsPerOrder: null });
  props.result.details.trend = [];
  const empty = render(props);
  assert.match(empty, /Średni zarobek na zmianę<\/dt><dd>Brak danych/);
  assert.match(empty, /Średni zarobek na zamówienie<\/dt><dd>Brak danych/);
  assert.match(empty, /Łączny dystans<\/dt><dd>Brak danych/);
  assert.match(empty, /15,00/);
  assert.match(empty, /Brak danych w wybranym zestawieniu/);
  assert.doesNotMatch(empty, /<canvas |NaN|undefined/);
  Object.assign(props.summary, { shiftCount: 1, distanceShiftCount: 1, earningsPerShift: '0.00' });
  props.result.details.weekdays[0] = { ...props.result.details.weekdays[0], shiftCount: 0, totalEarnings: '0.00', totalOrders: 0,
    totalHours: 0, earningsPerHour: null, ordersPerHour: null, earningsPerOrder: null };
  const noSample = render({ ...props, tableKind: 'weekdays' });
  assert.match(noSample, /Łączny dystans<\/dt><dd>0 km/);
  assert.match(noSample, /Brak uzupełnionych zmian w wybranym zestawieniu/);
  assert.match(table(noSample), /Brak danych/);
  props.result.details.weekdays[0].shiftCount = 1;
  props.result.details.weekdays[0].earningsPerHour = '0.00';
  props.result.details.weekdays[0].ordersPerHour = '0.00';
  const zero = render({ ...props, tableKind: 'weekdays' });
  assert.match(table(zero), /0,00/);
  assert.equal((zero.match(/<canvas /g) ?? []).length, 1);
});

test('loading/error hide stale tables and charts but preserve global metrics; controls and retry remain available', (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected request'); });
  const props = fixture();
  const loading = render({ ...props, result: { ...props.result, status: 'loading' } });
  assert.match(loading, /Wczytywanie szczegółowych danych/);
  assert.match(loading, /Średni zarobek na zamówienie/);
  assert.doesNotMatch(loading, /<canvas |<table /);
  const errorProps = { ...props, result: { ...props.result, status: 'error', message: 'Błąd zestawienia.' } };
  const error = render(errorProps);
  assert.match(error, /role="alert">Błąd zestawienia/);
  assert.doesNotMatch(error, /<canvas |<table /);
  let kind;
  let platform;
  let retried = false;
  const tree = Details({ ...errorProps, onTableKindChange: value => { kind = value; },
    onPlatformChange: value => { platform = value; }, result: { ...errorProps.result, retry: () => { retried = true; } } });
  const content = tree.props.children[1].props.children;
  const controls = content[1].props.children;
  controls[0].props.children[1].props.onChange({ target: { value: 'months' } });
  controls[1].props.children[1].props.onChange({ target: { value: 'wolt' } });
  content[6].props.children[1].props.onClick();
  assert.equal(kind, 'months');
  assert.equal(platform, 'wolt');
  assert.equal(retried, true);
  assert.equal(fetch.mock.callCount(), 0);
});

test('gross/net use their supplied financial aggregates while global costs and non-financial fields keep their meaning', () => {
  const gross = fixture();
  const net = fixture();
  net.summary = { ...net.summary, mode: 'estimated_net', earningsPerShift: '140.00', earningsPerOrder: '14.00' };
  net.result.details = { ...net.result.details, mode: 'estimated_net',
    trend: [{ ...net.result.details.trend[0], totalEarnings: '86.42', earningsPerOrder: '12.35', earningsPerHour: '28.81' }] };
  const markup = render(net);
  assert.match(markup, /Szacowane netto · wybrany okres kalendarzowy/);
  assert.match(markup, /140,00/);
  assert.match(markup, /14,00/);
  assert.match(table(markup), /86,42/);
  assert.match(table(markup), /12,35/);
  assert.match(table(markup), /28,81/);
  for (const input of [gross, net]) {
    const html = render(input);
    assert.match(html, /50 km/);
    assert.match(html, /15,00/);
    assert.match(table(html), /2,34/);
  }
});
