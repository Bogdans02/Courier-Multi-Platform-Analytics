import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { platformPerOrder, shiftMetrics } from '../src/utils/shiftMetrics.js';
import { formatShiftDay, formatTimeRange } from '../src/utils/shiftFormat.js';
import { getExpenses } from '../src/services/api/expenses.js';

const shift = { id: 7, status: 'completed', startedAt: '2026-11-03T16:30:00.000Z', endedAt: '2026-11-03T22:00:00.000Z',
  durationSeconds: 5.5 * 3600, distanceKm: '70.50', totalEarnings: '154.60', totalOrders: 9, estimatedNetEarnings: null,
  platformEntries: [{ platform: 'wolt', earningsGross: '96.40', ordersCount: 5 }, { platform: 'pyszne_pl', earningsGross: '58.20', ordersCount: 4 }] };
const fuel = { id: 1, shiftId: 7, category: 'fuel', amount: '120.00', expenseDate: '2026-11-03', note: null };

test('shift metrics divide the shift amount by hours, orders and kilometres', () => {
  const metrics = shiftMetrics(shift);
  assert.equal(metrics.amount, 154.6);
  assert.equal(metrics.label, 'brutto');
  assert.equal(metrics.perHour.toFixed(2), '28.11');
  assert.equal(metrics.perOrder.toFixed(2), '17.18');
  assert.equal(metrics.perKm.toFixed(2), '2.19');
  assert.equal(metrics.costs, 0);
  assert.equal(metrics.afterCosts, 154.6);
});

test('missing distance, zero orders and zero duration give no ratio instead of a fake zero', () => {
  const metrics = shiftMetrics({ ...shift, distanceKm: null, totalOrders: 0, durationSeconds: 0 });
  assert.deepEqual([metrics.perKm, metrics.perOrder, metrics.perHour], [null, null, null]);
  assert.equal(shiftMetrics({ ...shift, distanceKm: '0.00' }).perKm, null);
});

test('assigned costs are subtracted from the shift amount and can make the result negative', () => {
  const metrics = shiftMetrics(shift, [fuel, { ...fuel, id: 2, amount: '0.10' }]);
  assert.equal(metrics.costs, 120.1);
  assert.equal(metrics.afterCosts, 34.5);
  assert.equal(metrics.afterCostsPerHour.toFixed(2), '6.27');
  assert.equal(shiftMetrics(shift, [{ ...fuel, amount: '200.00' }]).afterCosts, -45.4);
});

test('the estimated net amount is used when the shift has one', () => {
  const metrics = shiftMetrics({ ...shift, estimatedNetEarnings: '136.05' }, [fuel]);
  assert.deepEqual([metrics.amount, metrics.label, metrics.afterCosts], [136.05, 'szac. netto', 16.05]);
});

test('per-order value of one platform is missing when it has no orders', () => {
  assert.equal(platformPerOrder({ earningsGross: '96.40', ordersCount: 5 }).toFixed(2), '19.28');
  assert.equal(platformPerOrder({ earningsGross: '10.00', ordersCount: 0 }), null);
});

test('shift day and time range are shown without seconds', () => {
  const start = new Date(2026, 10, 8, 8, 0, 30);
  assert.equal(formatShiftDay(start), 'Niedziela, 8 listopada');
  assert.equal(formatTimeRange(start, new Date(2026, 10, 8, 12, 0, 45)), '08:00 – 12:00');
  assert.match(formatTimeRange(new Date(2026, 10, 8, 22, 0), new Date(2026, 10, 9, 2, 0)), /^22:00 – 9 lis.*02:00$/);
});

test('expenses of one shift are requested with the shiftId filter', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => { urls.push(url); return new Response('{"expenses":[]}', { status: 200 }); });
  await getExpenses('token', { shiftId: 7 });
  assert.match(urls[0], /\/expenses\?shiftId=7$/);
});

let server;
let ShiftCosts;
let ShiftPlatformSummary;
before(async () => {
  server = await createServer({ server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  ShiftCosts = (await server.ssrLoadModule('/src/components/ShiftCosts.jsx')).default;
  ShiftPlatformSummary = (await server.ssrLoadModule('/src/components/ShiftPlatformSummary.jsx')).default;
});
after(async () => { await server?.close(); });
const render = (component, props) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(component, props)));

test('costs section lists assigned costs and what is left after them', () => {
  const markup = render(ShiftCosts, { shiftId: 7, expenses: [fuel], status: 'success', metrics: shiftMetrics(shift, [fuel]) });
  assert.match(markup, /Paliwo/);
  assert.match(markup, /03\.11\.2026/);
  assert.match(markup, /Po kosztach \(brutto\)<\/dt><dd>34,60\s*zł/);
  assert.match(markup, /href="\/expenses\/new"/);
  const empty = render(ShiftCosts, { shiftId: 7, expenses: [], status: 'success', metrics: shiftMetrics(shift) });
  assert.match(empty, /Brak kosztów przypisanych do tej zmiany/);
  assert.doesNotMatch(empty, /Po kosztach/);
  // An incomplete shift has no amount, so nothing is subtracted.
  assert.doesNotMatch(render(ShiftCosts, { shiftId: 7, expenses: [fuel], status: 'success', metrics: null }), /Po kosztach/);
});

test('platform list shows per-order value for each platform and the gross total', () => {
  const markup = render(ShiftPlatformSummary, { shift });
  assert.match(markup, /5 zam\. · 19,28\s*zł\/zam\./);
  assert.match(markup, /Razem brutto<\/dt><dd>154,60\s*zł/);
  assert.match(markup, /ustaw profil/);
  assert.match(render(ShiftPlatformSummary, { shift: { ...shift, estimatedNetEarnings: '136.05' } }), /Szacowane netto<\/dt><dd>136,05/);
});
