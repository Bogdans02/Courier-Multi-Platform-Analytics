import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { filterShifts, hourlyRate, monthOf, monthSummary, platformsUsed, shiftCountLabel } from '../src/utils/historySummary.js';
import { getShifts } from '../src/services/api/shifts.js';

function shift(id, entries, durationSeconds, extra = {}) {
  const platformEntries = entries.map(([platform, earningsGross]) => ({ platform, earningsGross, ordersCount: 1 }));
  const total = platformEntries.reduce((sum, entry) => sum + Number(entry.earningsGross), 0);
  return { id, status: 'completed', startedAt: '2026-11-05T10:00:00.000Z', endedAt: '2026-11-05T12:00:00.000Z',
    durationSeconds, distanceKm: null, platformEntries, totalEarnings: total.toFixed(2),
    totalOrders: platformEntries.length, estimatedNetEarnings: null, ...extra };
}

test('a shift belongs to the month it started in Polish time', () => {
  // 31.10 23:30 UTC = 1 November 00:30 in Warsaw.
  assert.equal(monthOf('2026-10-31T23:30:00.000Z'), '2026-11-01');
  assert.equal(monthOf('2026-10-31T22:30:00.000Z'), '2026-10-01');
});

test('month summary divides total earnings by total hours and skips incomplete shifts', () => {
  const shifts = [shift(1, [['glovo', '100.10']], 7200), shift(2, [['wolt', '50.20']], 3600), shift(3, [], 1800)];
  const summary = monthSummary(shifts);
  assert.equal(summary.earnings, 150.3);
  assert.equal(summary.hours, 3);
  // (100.10 + 50.20) / 3 h, not the average of 50.05 and 50.20 zł/h.
  assert.equal(summary.rate, 50.1);
  assert.equal(summary.label, 'brutto');
  assert.equal(summary.completeCount, 2);
  assert.equal(summary.incompleteCount, 1);
});

test('month summary uses netto only when every complete shift has an estimate', () => {
  const net = [shift(1, [['glovo', '100.00']], 3600, { estimatedNetEarnings: '88.00' }),
    shift(2, [['wolt', '50.00']], 3600, { estimatedNetEarnings: '44.00' })];
  assert.deepEqual([monthSummary(net).earnings, monthSummary(net).label], [132, 'szac. netto']);
  const mixed = [net[0], shift(2, [['wolt', '50.00']], 3600)];
  assert.deepEqual([monthSummary(mixed).earnings, monthSummary(mixed).label], [150, 'brutto']);
  assert.equal(monthSummary([]).rate, null);
});

test('hourly rate is missing instead of dividing by a zero duration', () => {
  assert.equal(hourlyRate('120.00', 7200), 60);
  assert.equal(hourlyRate('120.00', 0), null);
});

test('filters show incomplete shifts or shifts containing a platform, in the standard platform order', () => {
  const shifts = [shift(1, [['wolt', '10'], ['glovo', '20']], 3600), shift(2, [['bolt_food', '30']], 3600), shift(3, [], 60)];
  assert.deepEqual(platformsUsed(shifts).map(({ value }) => value), ['glovo', 'bolt_food', 'wolt']);
  assert.deepEqual(filterShifts(shifts, 'all').map(({ id }) => id), [1, 2, 3]);
  assert.deepEqual(filterShifts(shifts, 'incomplete').map(({ id }) => id), [3]);
  assert.deepEqual(filterShifts(shifts, 'wolt').map(({ id }) => id), [1]);
});

test('shift counts use Polish plural forms', () => {
  assert.deepEqual([1, 2, 4, 5, 12, 14, 22, 25].map(shiftCountLabel),
    ['1 zmiana', '2 zmiany', '4 zmiany', '5 zmian', '12 zmian', '14 zmian', '22 zmiany', '25 zmian']);
});

test('history asks the API for one month only when a month is given', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => { urls.push(url); return new Response('{"shifts":[]}', { status: 200 }); });
  await getShifts('token', undefined, '2026-11');
  await getShifts('token');
  assert.match(urls[0], /\/shifts\?month=2026-11$/);
  assert.match(urls[1], /\/shifts$/);
});

let server;
let ShiftCard;
before(async () => {
  server = await createServer({ server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  ShiftCard = (await server.ssrLoadModule('/src/components/ShiftCard.jsx')).default;
});
after(async () => { await server?.close(); });
const card = (props) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ShiftCard, props)));

test('history cards show zł/h and a complete button; the Start card stays unchanged', () => {
  const complete = shift(1, [['glovo', '70.90']], 7200);
  assert.match(card({ shift: complete, showRate: true }), /35,45\s*zł\/h/);
  assert.doesNotMatch(card({ shift: complete }), /\/h</);
  const incomplete = shift(2, [], 600);
  const history = card({ shift: incomplete, showRate: true, showCompleteAction: true });
  assert.match(history, /shift-card-incomplete/);
  assert.match(history, /<a[^>]*href="\/shifts\/2"[^>]*>Uzupełnij<\/a>/);
  assert.doesNotMatch(card({ shift: incomplete }), /Uzupełnij</);
});
