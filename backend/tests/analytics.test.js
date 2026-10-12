import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnalyticsService } from '../src/services/analyticsService.js';

test('summary validates the period and calculates rolling UTC bounds before querying', async () => {
  const now = new Date('2026-10-12T12:00:00.000Z');
  const calls = [];
  const service = createAnalyticsService({ async summary(...args) {
    calls.push(args);
    return { totalHours: '1.25', totalOrders: '3' };
  } }, () => now);
  for (const [period, days] of [['week', 7], ['month', 30], ['three_months', 90], ['all', null], [undefined, null]]) {
    const summary = await service.summary(42, period);
    const from = days ? new Date(now.getTime() - days * 86400000) : null;
    assert.deepEqual(calls.at(-1), [42, from, now]);
    assert.equal(summary.from, from?.toISOString() ?? null);
    assert.equal(summary.to, now.toISOString());
    assert.equal(summary.period, period ?? 'all');
    assert.equal(summary.totalHours, 1.25);
    assert.equal(summary.totalOrders, 3);
  }
  for (const period of ['', 'year', ['week', 'month'], {}, "week' OR TRUE"]) {
    await assert.rejects(service.summary(42, period), { status: 400 });
  }
  assert.equal(calls.length, 5);
});
