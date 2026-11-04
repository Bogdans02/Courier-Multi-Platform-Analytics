import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnalyticsService } from '../src/services/analyticsService.js';

test('current week begins at Warsaw Monday midnight for both analytics endpoints, including DST and year boundaries', async () => {
  for (const [instant, expected] of [
    ['2026-10-25T15:00:00Z', '2026-10-18T22:00:00.000Z'],
    ['2026-10-25T23:30:00Z', '2026-10-25T23:00:00.000Z'],
    ['2026-03-29T12:00:00Z', '2026-03-22T23:00:00.000Z'],
    ['2026-03-29T22:30:00Z', '2026-03-29T22:00:00.000Z'],
    ['2026-01-01T12:00:00Z', '2025-12-28T23:00:00.000Z'],
  ]) {
    const calls = [];
    const now = new Date(instant);
    const service = createAnalyticsService({
      async summary(...args) { calls.push(args); return { totalHours: '0', totalOrders: '0' }; },
      async hourlyGroups() { return { groups: [], bestRate: null }; },
      async details(...args) { calls.push(args); return { weekdays: [], startTimes: [] }; },
    }, () => now, { async get() { return { netProfile: 'custom', deductionRate: '0.20000' }; } });
    const summary = await service.summary(42, 'current_week', 'estimated_net');
    const details = await service.details(42, 'current_week', 'all', 'estimated_net');
    assert.equal(summary.from, expected);
    assert.equal(details.from, expected);
    assert.equal(summary.to, now.toISOString());
    assert.equal(details.to, now.toISOString());
    assert.deepEqual(calls, [[42, new Date(expected), now, '0.20000'],
      [42, new Date(expected), now, 'all', '0.20000']]);
  }
});

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
  const service = createAnalyticsService({ async hourlyGroups() { return { groups: [], bestRate: null }; },
    async details(...args) {
    calls.push(args);
    return { trend: [], months: [], weekdays: [], startTimes: [], platforms: [], shiftCount: 0 };
  } }, () => now);
  const result = await service.details(42, 'week', 'glovo');
  assert.deepEqual(calls[0], [42, new Date('2026-10-06T12:00:00Z'), now, 'glovo', '0']);
  assert.equal(result.timeZone, 'Europe/Warsaw');
  assert.deepEqual(result.weekdays.map((row) => row.key), ['1', '2', '3', '4', '5', '6', '7']);
  assert.deepEqual(result.startTimes.map((row) => row.key), ['0', '1', '2', '3']);
  assert.equal(result.weekdays[0].earningsPerHour, null);
  assert.equal(result.weekdays[0].totalHours, null);
  assert.equal(result.weekdays[0].ordersPerHour, null);
  const global = await service.details(42);
  assert.equal(global.platform, 'all');
  assert.equal(global.weekdays[0].totalHours, 0);
  assert.equal(global.startTimes[0].totalHours, 0);
  assert.equal(global.startTimes[0].ordersPerHour, null);
  assert.deepEqual(global.bestWeekdays, { status: 'no_data', earningsPerHour: null, days: [] });
  for (const platform of ['pyszne_pl', 'wolt']) {
    assert.equal((await service.details(42, 'all', platform)).platform, platform);
    assert.deepEqual(calls.at(-1), [42, null, now, platform, '0']);
  }
  for (const platform of ['', 'unknown', ['glovo', 'other'], {}, "glovo' OR TRUE"]) {
    await assert.rejects(service.details(42, 'all', platform), { status: 400 });
  }
  await assert.rejects(service.details(42, 'year', 'all'), { status: 400 });
  assert.equal(calls.length, 4);
});

test('best weekdays preserve a small sample, all rounded ties in weekday order, zero and uncomputable states', async () => {
  const day = (key, rate, hours = 2) => ({ key, earningsPerHour: rate, totalHours: hours, shiftCount: 1 });
  for (const [groups, expected] of [
    [[day('6', '42.60')], { status: 'available', earningsPerHour: '42.60', days: [day('6', '42.60')] }],
    [[day('7', '42.60'), day('1', '42.60'), day('2', '20.00')],
      { status: 'available', earningsPerHour: '42.60', days: [day('1', '42.60'), day('7', '42.60')] }],
    [[day('1', '0.00'), day('6', '0.00')], { status: 'all_zero', earningsPerHour: '0.00', days: [] }],
    [[], { status: 'no_data', earningsPerHour: null, days: [] }],
    [[day('1', null, 0)], { status: 'no_data', earningsPerHour: null, days: [] }],
  ]) {
    const service = createAnalyticsService({ async hourlyGroups() { return { groups: [], bestRate: null }; },
      async details() {
      return { weekdays: [], startTimes: [], rankingWeekdays: groups };
    } });
    const result = await service.details(42);
    assert.deepEqual(result.bestWeekdays, expected);
    assert.equal(Object.hasOwn(result, 'rankingWeekdays'), false);
  }
});

test('details forwards SQL group ratios and keeps best weekdays global with the selected financial mode', async () => {
  const calls = [];
  const ranking = [{ key: '1', shiftCount: 2, totalHours: 8, earningsPerHour: '40.00' }];
  const globalGroup = { key: '1', shiftCount: 2, totalHours: 8, totalOrders: 20,
    ordersPerHour: '2.50', earningsPerHour: '40.00', totalEarnings: '320.00', earningsPerOrder: '16.00' };
  const service = createAnalyticsService({ async hourlyGroups() { return { groups: [], bestRate: null }; },
    async details(...args) {
    calls.push(args);
    const group = args[3] === 'all' ? globalGroup : { ...globalGroup, totalHours: null,
      ordersPerHour: null, earningsPerHour: null };
    return { weekdays: [group], startTimes: [], rankingWeekdays: ranking };
  } }, () => new Date('2026-11-02T12:00:00Z'), {
    async get() { return { netProfile: 'custom', deductionRate: '0.20000' }; },
  });
  for (const platform of ['all', 'glovo']) {
    const result = await service.details(42, 'all', platform, 'estimated_net');
    assert.deepEqual(result.bestWeekdays.days, ranking);
    assert.equal(result.weekdays[0].ordersPerHour, platform === 'all' ? '2.50' : null);
    assert.equal(result.weekdays[0].totalHours, platform === 'all' ? 8 : null);
    assert.equal(calls.at(-1)[4], '0.20000');
  }
});

test('calendar summary forwards NUMERIC comparison results and uses one clock and net profile for both windows', async () => {
  let clockReads = 0, settingsReads = 0;
  const calls = [];
  const metrics = {
    totalEarnings: { previousValue: '100.00', changePercent: '25.0', reason: null },
    totalHours: { previousValue: 10, changePercent: '-20.0', reason: null },
    totalOrders: { previousValue: 5, changePercent: '-100.0', reason: null },
    earningsPerHour: { previousValue: '0.00', changePercent: null, reason: 'previous_zero' },
    earningsPerKm: { previousValue: null, changePercent: null, reason: 'undefined_metric' },
    ordersPerHour: { previousValue: null, changePercent: null, reason: 'no_previous_observations' },
  };
  const service = createAnalyticsService({
    async availableRange() { return { earliestDate: null, currentDate: '2026-11-04' }; },
    async summary(...args) {
    calls.push(args);
    return { totalHours: '8', totalOrders: '0', comparison: { previousShiftCount: 2,
      previousDistanceShiftCount: 1, metrics } };
  } }, () => { clockReads++; return new Date('2026-11-04T14:30:00Z'); }, {
    async get() { settingsReads++; return { netProfile: 'custom', deductionRate: '0.20000' }; },
  });
  const summary = await service.summary(42, undefined, 'estimated_net', { calendar: 'week', anchor: '2026-11-04' });
  assert.equal(clockReads, 1);
  assert.equal(settingsReads, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 42);
  assert.equal(calls[0][3], '0.20000');
  assert.equal(calls[0][4].asOf, calls[0][5].asOf);
  assert.equal(summary.comparison.previousWindow.observationCutoff, '2026-10-28T14:30:00.000Z');
  assert.deepEqual(summary.comparison.metrics, metrics);
  assert.equal(summary.totalOrders, 0);
  assert.equal(summary.totalHours, 8);
  assert.equal(Object.hasOwn(summary.comparison.metrics.totalHours, 'improvement'), false);
});

test('calendar all explicitly has NULL comparison while every legacy period omits it', async () => {
  const calls = [];
  let rangeReads = 0;
  const service = createAnalyticsService({
    async availableRange() { rangeReads++; return { earliestDate: null, currentDate: '2026-11-04' }; },
    async summary(...args) {
    calls.push(args);
    return { totalHours: '0', totalOrders: '0', comparison: null };
  } }, () => new Date('2026-11-04T14:30:00Z'));
  assert.equal((await service.summary(42, undefined, 'gross', { calendar: 'all' })).comparison, null);
  assert.equal(calls[0][5], null);
  for (const period of ['week', 'month', 'three_months', 'all', 'current_week']) {
    const result = await service.summary(42, period);
    assert.equal(Object.hasOwn(result, 'comparison'), false);
    assert.equal(Object.hasOwn(result, 'availableRange'), false);
    assert.equal(calls.at(-1).length, 4);
  }
  assert.equal(rangeReads, 1);
});

test('calendar availableRange forwards dates and NULL from repository using the shared asOf and a single clock read', async () => {
  const now = new Date('2026-11-04T12:00:00Z');
  for (const calendar of ['week', 'month', 'all']) {
    for (const asOf of [undefined, '2026-10-31T23:30:00Z']) {
      let clockReads = 0;
      const calls = [];
      const range = { earliestDate: asOf ? '2026-01-05' : null,
        currentDate: asOf ? '2026-11-01' : '2026-11-04' };
      const row = { totalHours: '2', totalOrders: '5', totalEarnings: '100.00' };
      const service = createAnalyticsService({
        async summary() { return row; },
        async availableRange(...args) { calls.push(args); return range; },
      }, () => { clockReads++; return now; });
      const result = await service.summary(42, undefined, 'gross', { calendar, asOf,
        ...(calendar !== 'all' && { anchor: '2026-10-19' }) });
      assert.equal(clockReads, 1);
      assert.deepEqual(calls, [[42, result.selection.asOf]]);
      assert.deepEqual(result.availableRange, range);
      assert.equal(result.totalEarnings, row.totalEarnings);
      assert.equal(result.totalHours, 2);
      assert.equal(result.totalOrders, 5);
      if (calendar !== 'all') assert.ok(result.selection.endExclusive < result.selection.asOf);
      else assert.equal(result.comparison, null);
    }
  }
});
