import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let Summary;
let Details;
before(async () => {
  server = await createServer({ server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  const module = await server.ssrLoadModule('/src/components/DashboardSummary.jsx');
  Summary = module.default;
  Details = module.DashboardDetails;
});
after(async () => { await server?.close(); });

const keys = ['totalEarnings', 'totalHours', 'totalOrders', 'earningsPerHour', 'earningsPerKm', 'ordersPerHour'];
function fixture() {
  return {
    mode: 'gross', selection: { kind: 'week', isPartial: true }, shiftCount: 2,
    totalEarnings: '400.00', totalHours: 10, totalOrders: 20,
    earningsPerHour: '40.00', earningsPerKm: '4.00', ordersPerHour: '2.00',
    distanceShiftCount: 1, totalDistance: '50.00', totalExpenses: '15.00', earningsPerShift: '200.00', earningsPerOrder: '20.00',
    comparison: { metrics: Object.fromEntries(keys.map(key => [key,
      { previousValue: 1, changePercent: '12.3', reason: null }])) },
  };
}
const render = summary => renderToStaticMarkup(createElement(Summary, { summary }));
// The hero rate line, then the earnings/order/km grid, then the context line.
const grid = markup => markup.match(/earnings-hero-grid[\s\S]*?<\/dl>/)[0];

test('hero card leads with the hourly rate and shows earnings, per-order and per-km from the backend', () => {
  const markup = render(fixture());
  assert.match(markup, /Ile zarabiam · brutto/);
  // Hourly rate is the biggest number and carries the /h unit.
  assert.match(markup, /earnings-hero-rate">40,00[\s\S]*?\/h/);
  assert.match(grid(markup), /Zarobek<\/dt><dd>400,00\s*zł/);
  assert.match(grid(markup), /Na zamówienie<\/dt><dd>20,00\s*zł/);
  assert.match(grid(markup), /Na kilometr<\/dt><dd>4,00\s*zł/);
  // Context line summarises the period without turning into a KPI grid.
  assert.match(markup, /2 zmian · 20 zam\. · 10 h/);
});

test('additional metrics stay in the details component, without the hero numbers', () => {
  const additional = renderToStaticMarkup(createElement(Details, { summary: fixture() }));
  for (const label of ['Łączne koszty w okresie', 'Liczba zmian', 'Łączny dystans', 'Średni zarobek na zmianę', 'Dostawy na godzinę']) {
    assert.ok(additional.includes(label));
  }
  assert.match(additional, /Dostawy na godzinę<\/dt><dd>2</); // ordersPerHour lives here now
  assert.match(additional, /50 km/);
  assert.match(additional, /zmian z podanym dystansem \(1 z 2\)/);
});

test('the hero formats the backend percent for rate and earnings and keeps the direction tone', () => {
  const summary = fixture();
  summary.comparison.metrics.earningsPerHour.changePercent = '12.3';
  summary.comparison.metrics.totalEarnings = { previousValue: '400.00', changePercent: '0.1', reason: null };
  const markup = render(summary);
  // Rate change sits under the big number; earnings change sits in the grid.
  assert.match(markup, /earnings-hero-change[\s\S]*?data-tone="up"[\s\S]*?\+12,3%/);
  assert.match(grid(markup), /data-tone="up"[\s\S]*?\+0,1%/);
  summary.comparison.metrics.earningsPerHour.changePercent = '-5.0';
  assert.match(render(summary), /earnings-hero-change[\s\S]*?data-tone="down"[\s\S]*?-5,0%/);
  summary.comparison.metrics.earningsPerHour.changePercent = '0.0';
  assert.match(render(summary), /earnings-hero-change[\s\S]*?data-tone="neutral"[\s\S]*?0,0%/);
});

test('zero shifts and null rates show a clear empty state and reasons, without invented percentages', () => {
  const summary = fixture();
  summary.shiftCount = 0;
  const empty = render(summary);
  assert.match(empty, /Brak uzupełnionych zmian w wybranym okresie/);
  assert.doesNotMatch(empty, /%|NaN|undefined|earnings-hero-rate/);

  const partial = fixture();
  partial.earningsPerHour = null;
  partial.earningsPerKm = null;
  partial.comparison.metrics.earningsPerHour = { previousValue: null, changePercent: null, reason: 'undefined_metric' };
  partial.comparison.metrics.totalEarnings = { previousValue: null, changePercent: null, reason: 'previous_zero' };
  const markup = render(partial);
  assert.match(markup, /earnings-hero-rate">—</);
  assert.match(markup, /Nieobliczalny wskaźnik/);
  assert.match(grid(markup), /Na kilometr<\/dt><dd>—<\/dd>/);
  assert.match(grid(markup), /Poprzedni wynik: 0/);
  assert.doesNotMatch(markup, /NaN|undefined/);
});

test('comparison context distinguishes partial week and complete month; all omits comparison', () => {
  const summary = fixture();
  assert.match(render(summary), /analogicznej części poprzedniego tygodnia/);
  summary.selection = { kind: 'month', isPartial: false };
  assert.match(render(summary), /względem poprzedniego miesiąca/);
  summary.selection.isPartial = true;
  assert.match(render(summary), /analogicznej części poprzedniego miesiąca/);
  summary.selection = { kind: 'all' };
  summary.comparison = null;
  assert.doesNotMatch(render(summary), /metric-comparison|względem|%/);
});

test('estimated net shows server net values without applying deductions in React', () => {
  const net = { ...fixture(), mode: 'estimated_net', deductionRate: '0.30', totalEarnings: '280.00',
    earningsPerHour: '28.00', earningsPerKm: '2.80' };
  const markup = render(net);
  assert.match(markup, /Ile zarabiam · szacowane netto/);
  assert.match(markup, /earnings-hero-rate">28,00/);
  assert.match(grid(markup), /280,00/);
  assert.match(grid(markup), /2,80/);
});
