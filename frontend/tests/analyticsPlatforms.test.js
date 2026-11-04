import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { platforms } from '../src/utils/platformEntries.js';

let server;
let Platforms;
let DataTable;
before(async () => {
  server = await createServer({ server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  Platforms = (await server.ssrLoadModule('/src/components/AnalyticsPlatforms.jsx')).default;
  DataTable = (await server.ssrLoadModule('/src/components/AnalyticsDataTable.jsx')).default;
});
after(async () => { await server?.close(); });

function fixture() {
  const shares = ['4.76', '9.52', '14.29', '19.05', '23.81', '28.57'];
  return platforms.map(({ value }, index) => ({ platform: value, shiftCount: 1,
    totalEarnings: `${(index + 1) * 10}.00`, totalOrders: index + 1,
    earningsShare: shares[index], ordersShare: shares[index], earningsPerOrder: '10.00' }));
}
const render = (rows = fixture(), metricKey = 'earnings', mode = 'gross') => renderToStaticMarkup(
  createElement(Platforms, { rows, metricKey, mode, onMetricChange() {} }));
const row = (markup, platform) => markup.match(new RegExp(`data-platform="${platform}"[\\s\\S]*?</li>`))[0];

test('platform section presents all six platforms in stable order with server earnings and percentage shares', () => {
  const markup = render(fixture().reverse());
  assert.deepEqual([...markup.matchAll(/data-platform="([^"]+)"/g)].map(match => match[1]), platforms.map(item => item.value));
  for (const platform of platforms) assert.ok(markup.includes(platform.label));
  assert.match(markup, /aria-pressed="true">Zarobki/);
  assert.match(markup, /Brutto · udział w zarobkach/);
  assert.match(row(markup, 'glovo'), /10,00.*?zł/);
  assert.match(row(markup, 'glovo'), /4,76%/);
  assert.match(row(markup, 'glovo'), /width:4.76%/);
  assert.doesNotMatch(markup, /Zł\/h|Dostawy\/h|Zł\/km/);
});

test('orders switch selects final totalOrders and ordersShare, without a new request or changing the supplied rows', (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected request'); });
  const rows = fixture();
  rows[0] = { ...rows[0], totalOrders: 123, ordersShare: '51.23' };
  const original = structuredClone(rows);
  let picked;
  const element = Platforms({ rows, metricKey: 'earnings', mode: 'gross', onMetricChange: key => { picked = key; } });
  element.props.children[1].props.children[1].props.onClick();
  assert.equal(picked, 'orders');
  const markup = render(rows, picked);
  assert.match(markup, /aria-pressed="true">Zamówienia/);
  assert.match(markup, /Liczba zamówień · udział w zamówieniach/);
  assert.match(row(markup, 'glovo'), /platform-share-value">123</);
  assert.match(row(markup, 'glovo'), /51,23%/);
  assert.doesNotMatch(markup, /zł|Brutto|Szacowane netto/);
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual(rows, original);
});

test('recorded zero, missing platform rows and undefined percentage shares remain distinct', () => {
  const rows = fixture();
  rows[0] = { ...rows[0], totalEarnings: '0.00', totalOrders: 0, earningsShare: '0.00', ordersShare: '0.00' };
  const zero = render(rows);
  assert.match(row(zero, 'glovo'), /0,00.*?zł/);
  assert.match(row(zero, 'glovo'), /width:0%/);
  assert.match(row(zero, 'glovo'), /0%/);
  assert.match(row(render(rows, 'orders'), 'glovo'), /platform-share-value">0</);
  const noBase = render([{ ...rows[0], earningsShare: null }]);
  assert.match(row(noBase, 'glovo'), /0,00.*?zł/);
  assert.match(row(noBase, 'glovo'), /Brak podstawy/);
  assert.doesNotMatch(row(noBase, 'glovo'), /platform-share-track|%/);
  assert.match(row(noBase, 'wolt'), /platform-share-value">Brak danych</);
  assert.doesNotMatch(row(noBase, 'wolt'), /platform-share-track|%/);
});

test('an empty platform cohort shows its empty state and six unavailable rows instead of invented zeros', () => {
  for (const metric of ['earnings', 'orders']) {
    const markup = render([], metric);
    assert.match(markup, /Brak danych platform w wybranym okresie/);
    assert.equal((markup.match(/data-platform=/g) ?? []).length, 6);
    assert.doesNotMatch(markup, /platform-share-track|0%|0,00|NaN|undefined/);
  }
});

test('estimated net formats backend money/shares without deriving shares from rounded amounts, while orders stay unchanged', () => {
  const gross = fixture().slice(0, 2).map((item, index) => ({ ...item,
    totalEarnings: index === 0 ? '0.01' : '0.02', earningsShare: index === 0 ? '33.33' : '66.67' }));
  const net = gross.map(item => ({ ...item, totalEarnings: '0.01' }));
  const markup = render(net, 'earnings', 'estimated_net');
  assert.match(markup, /Szacowane netto · udział w zarobkach/);
  assert.match(row(markup, 'glovo'), /0,01.*?zł/);
  assert.match(row(markup, 'glovo'), /33,33%/);
  assert.match(row(markup, 'bolt_food'), /66,67%/);
  assert.equal(render(gross, 'orders', 'gross'), render(net, 'orders', 'estimated_net'));
  const fullyDeducted = gross.map(item => ({ ...item, totalEarnings: '0.00', earningsShare: null }));
  const zeroNet = render(fullyDeducted, 'earnings', 'estimated_net');
  assert.match(row(zeroNet, 'glovo'), /0,00.*?zł[\s\S]*Brak podstawy/);
  assert.doesNotMatch(zeroNet, /platform-share-track/);
  assert.equal(render(gross, 'orders'), render(fullyDeducted, 'orders', 'estimated_net'));
});

test('the existing detailed platform table keeps counts, earnings/order and both backend shares without platform hourly metrics', () => {
  const markup = renderToStaticMarkup(createElement(DataTable, {
    title: 'Platformy', kind: 'platforms', rows: fixture(), mode: 'gross', platform: 'all',
  }));
  for (const title of ['Zmiany', 'Zamówienia', 'Zł/zamówienie', 'Udział zarobków', 'Udział zamówień']) {
    assert.ok(markup.includes(title));
  }
  assert.match(markup, /4,76%/);
  assert.doesNotMatch(markup, /Zł\/h|Dostawy\/h|Czas pracy|Zł\/km/);
});
