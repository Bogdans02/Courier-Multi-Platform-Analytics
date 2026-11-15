import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateHourlyActivity, finishHourlyActivity } from '../src/services/analyticsHourlyActivity.js';
import { dateFromMicroseconds, intersectWarsawBuckets, intersectWarsawDayBuckets,
  warsawBucketKey, warsawWeekdayKey } from '../src/services/analyticsWindow.js';
import { validateAnalyticsPlatform } from '../src/validators/analyticsValidator.js';

const us = date => (BigInt(Date.parse(date)) * 1000n).toString();
const asOf = '2026-11-02T12:00:00Z';
const event = (time, platform = 'glovo') => ({ clickedAtUs: us(time), platform });
const shift = (id, start, end, events = []) => ({ id, startedAtUs: us(start), endedAtUs: us(end), events });

test('hourly intersections split at local noon and midnight and preserve the whole real duration', () => {
  for (const [start, end, expected] of [
    ['2026-10-05T09:30:00Z', '2026-10-05T10:30:00Z', [[5, 0.5], [6, 0.5]]],
    ['2026-10-05T21:30:00Z', '2026-10-05T23:00:00Z', [[0, 1], [11, 0.5]]],
  ]) {
    const result = intersectWarsawBuckets(BigInt(us(start)), BigInt(us(end)));
    assert.deepEqual(result.map((value, key) => [key, Number(value) / 3600000000]).filter(([, hours]) => hours), expected);
    assert.equal(result.reduce((sum, value) => sum + value, 0n), BigInt(us(end)) - BigInt(us(start)));
  }
  assert.equal(warsawBucketKey(new Date('2026-10-05T10:00:00Z')), '6');
});

test('hourly intersections handle one real hour in spring and three in autumn, including both repeated clock times', () => {
  for (const [start, end, hours] of [
    ['2026-03-29T01:00:00Z', '2026-03-29T02:00:00Z', 1],
    ['2026-10-25T00:00:00Z', '2026-10-25T03:00:00Z', 3],
  ]) {
    const result = intersectWarsawBuckets(BigInt(us(start)), BigInt(us(end)));
    assert.equal(Number(result[1]) / 3600000000, hours);
    assert.equal(result.filter(value => value > 0n).length, 1);
  }
  assert.equal(warsawBucketKey(new Date('2026-10-25T00:30:00Z')), '1');
  assert.equal(warsawBucketKey(new Date('2026-10-25T01:30:00Z')), '1');
});

test('event bounds are half-open, honor observation time, retain exact microseconds and classify noon once', () => {
  const row = shift(1, '2026-10-05T09:30:00Z', '2026-10-05T10:30:00Z', [
    event('2026-10-05T09:29:00Z'), event('2026-10-05T09:30:00Z'),
    event('2026-10-05T10:00:00Z'), event('2026-10-05T10:30:00Z'), event('2026-11-03T12:00:00Z'),
  ]);
  const result = aggregateHourlyActivity([row], asOf, 'all');
  assert.equal(result.groups[5].registeredOrders, 1);
  assert.equal(result.groups[6].registeredOrders, 1);
  assert.equal(result.quality.invalidEventCount, 3);
  assert.equal(result.quality.includedShiftCount, 1);
  const precise = { ...row, startedAtUs: (BigInt(row.startedAtUs) + 1n).toString(), events: [row.events[1]] };
  assert.equal(aggregateHourlyActivity([precise], asOf, 'all').quality.includedShiftCount, 0);
  assert.equal(warsawBucketKey(dateFromMicroseconds(BigInt(us('1969-12-31T01:00:00Z')) - 1n)), '0');
});

test('only shifts with valid registrations contribute whole time before an independent event platform filter', () => {
  const rows = [
    shift(1, '2026-10-05T08:00:00Z', '2026-10-05T10:00:00Z', [event('2026-10-05T09:00:00Z')]),
    shift(2, '2026-10-06T08:00:00Z', '2026-10-06T10:00:00Z'),
    shift(3, '2026-10-07T08:00:00Z', '2026-10-07T10:00:00Z', [event('2026-10-07T10:00:00Z')]),
  ];
  const all = aggregateHourlyActivity(rows, asOf, 'all');
  const wolt = aggregateHourlyActivity(rows, asOf, 'wolt');
  assert.equal(all.groups[5].workMicroseconds, '7200000000');
  assert.equal(all.groups[5].registeredOrders, 1);
  assert.equal(wolt.groups[5].workMicroseconds, all.groups[5].workMicroseconds);
  assert.equal(wolt.groups[5].registeredOrders, 0);
  assert.deepEqual(wolt.quality, all.quality);
  assert.equal(all.quality.shiftsWithoutValidEvents, 2);
  assert.equal(all.quality.coverageStatus, 'unknown');
  assert.equal(wolt.mode, 'count');
  assert.equal(wolt.status, 'available');
});

test('overlap excludes every participant including nested shifts and shifts without events, but permits touching ends', () => {
  const rows = [
    shift(1, '2026-10-05T08:00:00Z', '2026-10-05T12:00:00Z', [event('2026-10-05T09:00:00Z')]),
    shift(2, '2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z'),
    shift(3, '2026-10-05T11:00:00Z', '2026-10-05T13:00:00Z', [event('2026-10-05T12:00:00Z')]),
    shift(4, '2026-10-05T13:00:00Z', '2026-10-05T14:00:00Z', [event('2026-10-05T13:00:00Z')]),
  ];
  const result = aggregateHourlyActivity(rows, asOf, 'all');
  assert.equal(result.quality.excludedOverlapShiftCount, 3);
  assert.equal(result.quality.overlapEventCount, 2);
  assert.equal(result.quality.includedShiftCount, 1);
  assert.equal(result.groups.reduce((sum, group) => sum + BigInt(group.workMicroseconds), 0n), 3600000000n);
  assert.equal(aggregateHourlyActivity(rows.slice(0, 3), asOf, 'all').emptyReason, 'overlapping_shifts');
});

test('empty reasons distinguish missing cohort, absent events and wholly invalid registrations', () => {
  const row = shift(1, '2026-10-05T08:00:00Z', '2026-10-05T10:00:00Z');
  for (const [rows, reason] of [[[], 'no_completed_shifts'], [[row], 'no_events'],
    [[{ ...row, events: [event('2026-10-05T07:00:00Z')] }], 'no_valid_events']]) {
    const result = aggregateHourlyActivity(rows, asOf, 'all');
    assert.equal(result.emptyReason, reason);
    assert.equal(result.status, 'no_data');
    assert.equal(result.groups.length, 12);
  }
});

const cell = (activity, weekday, hour) => activity.cells.find(c => c.weekday === weekday && c.hour === hour);

test('the day grid sums to the hour buckets and splits a shift across weekdays at local midnight', () => {
  // 22:00 wt → 02:00 śr (Warsaw). 20:00–00:00 UTC. Wtorek = 2, środa = 3.
  const start = BigInt(us('2026-10-06T20:00:00Z')), end = BigInt(us('2026-10-06T23:59:59Z'));
  const hours = intersectWarsawBuckets(start, end);
  const grid = intersectWarsawDayBuckets(start, end);
  // Suma kolumn siatki musi równać się prostemu widokowi godzinowemu.
  for (let hour = 0; hour < 12; hour++) {
    const column = [0, 1, 2, 3, 4, 5, 6].reduce((sum, weekday) => sum + grid[weekday * 12 + hour], 0n);
    assert.equal(column, hours[hour]);
  }
  // Czas przed północą należy do wtorku (dzień 2), po północy do środy (dzień 3).
  assert.ok(grid[(2 - 1) * 12 + 11] > 0n); // wtorek, 22:00–24:00
  assert.ok(grid[(3 - 1) * 12 + 0] > 0n);  // środa, 00:00–02:00
  assert.equal(grid.reduce((sum, value) => sum + value, 0n), end - start);
  assert.equal(warsawWeekdayKey(new Date('2026-10-06T21:00:00Z')), '2'); // wtorek w Warszawie
  assert.equal(warsawWeekdayKey(new Date('2026-10-06T23:00:00Z')), '3'); // już środa
});

test('cells carry the same rate as the hour view, split events by weekday, and mark worked-but-empty cells', () => {
  // Wtorek 2026-11-03, 10:00–12:00 Warsaw (09:00–11:00 UTC), dwie dostawy.
  const rows = [shift(1, '2026-11-03T09:00:00Z', '2026-11-03T11:00:00Z',
    [event('2026-11-03T09:30:00Z'), event('2026-11-03T10:30:00Z')])];
  const raw = aggregateHourlyActivity(rows, '2026-11-04T00:00:00Z', 'all');
  const finished = finishHourlyActivity(raw, { groups: raw.groups, bestRate: '1.00' });
  const c = cell(finished, 2, 5); // wtorek, 10:00–12:00
  assert.equal(c.status, 'available');
  assert.equal(c.registeredOrders, 2);
  assert.equal(c.value, 1); // 2 dostawy / 2 h = 1,00 dostawy/h
  // Komórka bez pracy jest pusta (null), nie zero.
  assert.equal(cell(finished, 1, 5).status, 'no_data');
  assert.equal(cell(finished, 1, 5).value, null);
  // Najcieplejsza komórka to ta jedyna aktywna.
  assert.deepEqual(finished.best, { weekday: 2, hour: 5, label: c.label, value: 1 });
});

test('count mode fills cells with order counts and skips the rate', () => {
  const rows = [shift(1, '2026-11-03T09:00:00Z', '2026-11-03T11:00:00Z',
    [event('2026-11-03T09:30:00Z', 'wolt'), event('2026-11-03T10:30:00Z', 'glovo')])];
  const finished = finishHourlyActivity(aggregateHourlyActivity(rows, '2026-11-04T00:00:00Z', 'wolt'),
    { groups: [], bestRate: null });
  const c = cell(finished, 2, 5);
  assert.equal(c.value, 1); // tylko jedna dostawa wolt
  assert.equal(finished.best.value, 1);
});

test('coverage marks a sparse week as insufficient and a spread-out set as sufficient for the heatmap', () => {
  // Jedna zmiana, jedna aktywna komórka — za mało na mapę 7×12.
  const sparse = finishHourlyActivity(aggregateHourlyActivity(
    [shift(1, '2026-11-03T09:00:00Z', '2026-11-03T11:00:00Z', [event('2026-11-03T09:30:00Z')])],
    '2026-11-10T00:00:00Z', 'all'), { groups: [], bestRate: '1.00' });
  assert.equal(sparse.coverage.sufficient, false);
  // Cztery dni, długie zmiany pokrywające wiele por — wystarczająco.
  const spread = [
    shift(1, '2026-11-02T06:00:00Z', '2026-11-02T14:00:00Z', [event('2026-11-02T07:00:00Z')]),
    shift(2, '2026-11-03T06:00:00Z', '2026-11-03T14:00:00Z', [event('2026-11-03T07:00:00Z')]),
    shift(3, '2026-11-04T06:00:00Z', '2026-11-04T14:00:00Z', [event('2026-11-04T07:00:00Z')]),
    shift(4, '2026-11-05T06:00:00Z', '2026-11-05T14:00:00Z', [event('2026-11-05T07:00:00Z')]),
  ];
  const rich = finishHourlyActivity(aggregateHourlyActivity(spread, '2026-11-10T00:00:00Z', 'all'),
    { groups: [], bestRate: '1.00' });
  assert.equal(rich.coverage.activeWeekdays, 4);
  assert.ok(rich.coverage.activeCells >= 8);
  assert.equal(rich.coverage.sufficient, true);
});

test('with no included shifts the grid is empty, best is null and coverage is insufficient', () => {
  const finished = finishHourlyActivity(aggregateHourlyActivity([], asOf, 'all'), { groups: [], bestRate: null });
  assert.equal(finished.cells.length, 84);
  assert.ok(finished.cells.every(c => c.status === 'no_data' && c.value === null));
  assert.equal(finished.best, null);
  assert.equal(finished.coverage.sufficient, false);
});

test('hourly ranking maps every rounded tie, suppresses zero and count-mode ranking, and validates eventPlatform', () => {
  const raw = aggregateHourlyActivity([], asOf, 'all');
  const groups = [{ key: '1', registeredOrdersPerHour: '2.00' }, { key: '6', registeredOrdersPerHour: '2.00' }];
  assert.deepEqual(finishHourlyActivity(raw, { groups, bestRate: '2.00' }).bestIntervals.keys, ['1', '6']);
  assert.equal(finishHourlyActivity(raw, { groups: [], bestRate: null }).bestIntervals.status, 'no_data');
  assert.equal(finishHourlyActivity(raw, { groups: [], bestRate: '0.00' }).bestIntervals.status, 'all_zero');
  assert.deepEqual(finishHourlyActivity({ ...raw, mode: 'count' }, { groups: [], bestRate: null }).bestIntervals,
    { status: 'unavailable', registeredOrdersPerHour: null, keys: [] });
  for (const value of ['all', 'glovo', 'bolt_food', 'uber_eats', 'pyszne_pl', 'wolt', 'other']) {
    assert.equal(validateAnalyticsPlatform(value, 'eventPlatform'), value);
  }
  for (const value of ['', 'invalid', ['glovo', 'wolt']]) {
    assert.throws(() => validateAnalyticsPlatform(value, 'eventPlatform'), { status: 400 });
  }
});
