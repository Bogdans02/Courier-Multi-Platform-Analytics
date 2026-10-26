import test from 'node:test';
import assert from 'node:assert/strict';
import { todaySummary, todayEarningsFromTrend } from '../src/utils/todaySummary.js';

const shift = (overrides = {}) => ({ status: 'completed', startedAt: '2026-10-21T08:00:00Z',
  platformEntries: [{ platform: 'glovo' }, { platform: 'bolt_food' }], totalEarnings: '0.10',
  totalOrders: 2, durationSeconds: 3600, distanceKm: null, ...overrides });

test('today uses the Warsaw start day, ignores future/active/incomplete shifts and counts whole shifts once', () => {
  const summary = todaySummary([
    shift(), shift({ totalEarnings: '0.20', distanceKm: '0.00' }),
    shift({ startedAt: '2026-10-20T22:30:00Z', distanceKm: '1.25' }),
    shift({ startedAt: '2026-10-20T21:30:00Z' }),
    shift({ startedAt: '2026-10-21T20:00:00Z' }),
    shift({ status: 'active' }), shift({ platformEntries: [], totalEarnings: '0.00' }),
  ], new Date('2026-10-21T12:00:00Z'));
  assert.deepEqual(summary, { totalEarnings: '0.40', totalOrders: 6, durationSeconds: 10800,
    distanceKm: '1.25', incompleteCount: 1 });
});

test('today distinguishes missing distance from recorded zero and preserves actual zero earnings', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  assert.equal(todaySummary([shift()], now).distanceKm, null);
  const summary = todaySummary([shift({ distanceKm: '0.00', totalEarnings: '0.00', totalOrders: 0 })], now);
  assert.equal(summary.distanceKm, '0.00');
  assert.equal(summary.totalEarnings, '0.00');
  assert.equal(summary.totalOrders, 0);
  assert.equal(todaySummary([], now).durationSeconds, 0);
});

test('today earnings use the Warsaw daily aggregate without summing rounded shift estimates', () => {
  const now = new Date('2026-10-20T22:30:00Z');
  const trend = [{ key: '2026-10-20', totalEarnings: '100.00' },
    { key: '2026-10-21', totalEarnings: '0.01' }];
  assert.equal(todayEarningsFromTrend(trend, now), '0.01');
  assert.equal(todayEarningsFromTrend([], now), '0.00');
  assert.equal(todayEarningsFromTrend([{ key: '2026-10-21', totalEarnings: '0.00' }], now), '0.00');
});
