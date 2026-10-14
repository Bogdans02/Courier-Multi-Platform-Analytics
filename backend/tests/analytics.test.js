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
    assert.deepEqual(calls.at(-1), [42, from, now, '0']);
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

test('details validates both filters and supplies ordered empty weekday and start-time groups', async () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const calls = [];
  const service = createAnalyticsService({ async details(...args) {
    calls.push(args);
    return { trend: [], months: [], weekdays: [], startTimes: [], platforms: [], shiftCount: 0 };
  } }, () => now);
  const result = await service.details(42, 'week', 'glovo');
  assert.deepEqual(calls[0], [42, new Date('2026-10-06T12:00:00Z'), now, 'glovo', '0']);
  assert.equal(result.timeZone, 'Europe/Warsaw');
  assert.deepEqual(result.weekdays.map((row) => row.key), ['1', '2', '3', '4', '5', '6', '7']);
  assert.deepEqual(result.startTimes.map((row) => row.key), ['0', '1', '2', '3']);
  assert.equal(result.weekdays[0].earningsPerHour, null);
  assert.equal((await service.details(42)).platform, 'all');
  for (const platform of ['', 'unknown', ['glovo', 'other'], {}, "glovo' OR TRUE"]) {
    await assert.rejects(service.details(42, 'all', platform), { status: 400 });
  }
  await assert.rejects(service.details(42, 'year', 'all'), { status: 400 });
  assert.equal(calls.length, 2);
});
