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
const card = (markup, key) => markup.match(new RegExp(`data-metric="${key}"[\\s\\S]*?</dd>`))[0];

test('summary renders six ordered KPI and preserves only additional metrics in the existing disclosure', () => {
  const summary = fixture();
  const markup = render(summary);
  assert.deepEqual([...markup.matchAll(/data-metric="([^"]+)"/g)].map(match => match[1]), keys);
  for (const label of ['Zarobek', 'Czas pracy', 'Zamówienia', 'Zarobek / h', 'Stawka / km', 'Dostawy / h']) {
    assert.ok(markup.includes(label));
  }
  assert.match(card(markup, 'totalHours'), /10 godz\./);
  assert.match(card(markup, 'ordersPerHour'), /analytics-kpi-value">2</);
  assert.equal((markup.match(/analytics-kpi-primary/g) ?? []).length, 4);
  const additional = renderToStaticMarkup(createElement(Details, { summary }));
  for (const label of ['Łączne koszty w okresie', 'Liczba zmian', 'Łączny dystans', 'Średni zarobek na zmianę', 'Średni zarobek na zamówienie']) {
    assert.ok(additional.includes(label));
  }
  assert.doesNotMatch(additional, /Stawka \/ km|Dostawy \/ h|Zamówienia \/ h|Zarobek na kilometr/);
  assert.match(additional, /Dystans: 1 z 2 zmian/);
});

test('cards format the supplied backend percent with one decimal and keep working hours neutral in both directions', () => {
  const summary = fixture();
  summary.comparison.metrics.totalEarnings = { previousValue: '400.00', changePercent: '0.1', reason: null };
  summary.earningsPerKm = '0.00';
  summary.comparison.metrics.earningsPerKm.changePercent = '-100.0';
  summary.comparison.metrics.ordersPerHour.changePercent = '0.0';
  const markup = render(summary);
  // Equal rounded card amounts can still have a nonzero exact backend percentage.
  assert.match(card(markup, 'totalEarnings'), /\+0,1%/);
  for (const key of ['totalOrders', 'earningsPerHour']) assert.match(card(markup, key), /\+12,3%/);
  assert.match(card(markup, 'earningsPerKm'), /-100,0%/);
  assert.match(card(markup, 'ordersPerHour'), /data-tone="neutral"[\s\S]*?0,0%/);
  summary.totalEarnings = '0.00';
  summary.comparison.metrics.totalEarnings = { previousValue: '100.00', changePercent: '-100.0', reason: null };
  assert.match(card(render(summary), 'totalEarnings'), /0,00[\s\S]*-100,0%/);
  for (const value of ['50.0', '-50.0']) {
    summary.comparison.metrics.totalHours.changePercent = value;
    assert.match(card(render(summary), 'totalHours'), /data-tone="neutral"/);
    assert.doesNotMatch(card(render(summary), 'totalHours'), /data-tone="up"|data-tone="down"/);
  }
});

test('missing observations, NULL rates and previous zero have distinct unavailable states without invented percentages', () => {
  const summary = fixture();
  summary.shiftCount = 0;
  summary.totalEarnings = '0.00';
  summary.totalHours = 0;
  summary.earningsPerHour = null;
  summary.earningsPerKm = null;
  const reasons = ['no_current_observations', 'previous_zero', 'no_previous_observations', 'undefined_metric', 'no_current_observations', null];
  keys.forEach((key, i) => { summary.comparison.metrics[key] = { previousValue: null, changePercent: null, reason: reasons[i] }; });
  const markup = render(summary);
  assert.match(markup, /Brak uzupełnionych zmian/);
  assert.match(card(markup, 'totalEarnings'), /Brak bieżących danych/);
  assert.match(card(markup, 'totalHours'), /0 godz\.[\s\S]*Poprzedni wynik: 0/);
  assert.match(card(markup, 'totalOrders'), /Brak poprzednich danych/);
  assert.match(card(markup, 'earningsPerHour'), /Brak danych[\s\S]*Nieobliczalny wskaźnik/);
  assert.match(card(markup, 'earningsPerKm'), /analytics-kpi-value">Brak danych</);
  assert.match(card(markup, 'ordersPerHour'), /Brak porównania/);
  assert.doesNotMatch(markup, /%|NaN|undefined/);
});

test('comparison context distinguishes partial week and complete month; all and legacy summaries omit comparisons', () => {
  const summary = fixture();
  assert.match(render(summary), /analogicznej części poprzedniego tygodnia/);
  summary.selection = { kind: 'month', isPartial: false };
  assert.match(render(summary), /Zmiana względem poprzedniego miesiąca/);
  summary.selection.isPartial = true;
  assert.match(render(summary), /analogicznej części poprzedniego miesiąca/);
  summary.selection = { kind: 'all' };
  summary.comparison = null;
  assert.doesNotMatch(render(summary), /metric-comparison|Zmiana względem|%/);
  delete summary.selection;
  delete summary.comparison;
  assert.doesNotMatch(render(summary), /metric-comparison|Zmiana względem|%/);
});

test('gross and estimated net display their server financial values and percentages without applying deductions in React', () => {
  const gross = fixture();
  const net = { ...fixture(), mode: 'estimated_net', deductionRate: '0.30', totalEarnings: '280.00',
    earningsPerHour: '28.00', earningsPerKm: '2.80' };
  net.comparison.metrics.totalEarnings.changePercent = '7.8';
  const grossMarkup = render(gross);
  const netMarkup = render(net);
  assert.match(card(grossMarkup, 'totalEarnings'), /400,00/);
  assert.match(card(netMarkup, 'totalEarnings'), /280,00[\s\S]*\+7,8%/);
  assert.match(card(netMarkup, 'earningsPerHour'), /28,00/);
  assert.match(card(netMarkup, 'earningsPerKm'), /2,80/);
  for (const key of ['totalHours', 'totalOrders', 'ordersPerHour']) {
    assert.equal(card(grossMarkup, key), card(netMarkup, key));
  }
});
