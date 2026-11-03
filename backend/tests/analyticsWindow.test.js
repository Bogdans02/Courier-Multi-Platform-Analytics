import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCalendarSelection, validateSummaryPeriod } from '../src/validators/analyticsValidator.js';
import { resolveAnalyticsWindow, resolvePreviousWindow } from '../src/services/analyticsWindow.js';
import { createAnalyticsService } from '../src/services/analyticsService.js';

const now = new Date('2026-11-05T12:34:56.789Z');

test('calendar validation accepts week, month and all, UTC asOf and all legacy periods', () => {
  for (const calendar of ['week', 'month']) {
    assert.deepEqual(validateCalendarSelection({ calendar, anchor: '2026-11-05' }, now),
      { calendar, anchor: '2026-11-05', asOf: now });
  }
  const saved = validateCalendarSelection({ calendar: 'all', asOf: '2026-10-31T12:00:00Z' }, now);
  assert.equal(saved.asOf.toISOString(), '2026-10-31T12:00:00.000Z');
  assert.equal(validateCalendarSelection({ calendar: 'all' }, now).anchor, undefined);
  for (const period of ['week', 'month', 'three_months', 'all', 'current_week']) {
    assert.equal(validateSummaryPeriod(period), period);
    assert.equal(validateCalendarSelection({ period }, now), null);
  }
  assert.equal(resolveAnalyticsWindow({}, now).period, 'all');
});

test('calendar validation rejects conflicts, missing anchors, invalid dates, repeated values and future asOf', () => {
  const valid = { calendar: 'week', anchor: '2026-11-05' };
  for (const query of [
    { calendar: 'year' }, { ...valid, period: 'week' },
    { calendar: 'week' }, { calendar: 'month' }, { ...valid, calendar: 'all' },
    { ...valid, anchor: '05-11-2026' }, { ...valid, anchor: '2026-02-29' },
    { ...valid, anchor: '2026-04-31' }, { ...valid, anchor: '2026-11-05T00:00:00Z' },
    { ...valid, calendar: ['week', 'month'] }, { ...valid, anchor: ['2026-11-05', '2026-11-04'] },
    { ...valid, asOf: ['2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z'] },
    { ...valid, asOf: 'invalid' }, { ...valid, asOf: '2026-11-05' },
    { ...valid, asOf: '2026-11-01T00:00:00+01:00' }, { ...valid, asOf: '2026-02-30T00:00:00.000Z' },
    { ...valid, asOf: '2026-11-05T12:34:56.790Z' },
    { anchor: '2026-11-05' }, { period: 'all', asOf: now.toISOString() },
  ]) assert.throws(() => validateCalendarSelection(query, now), { status: 400 }, JSON.stringify(query));
});

test('calendar week normalizes Monday and Sunday to the same Warsaw week, including a year boundary', () => {
  for (const anchor of ['2026-11-02', '2026-11-08']) {
    const result = resolveAnalyticsWindow({ calendar: 'week', anchor }, new Date('2026-11-10T00:00:00Z'));
    assert.deepEqual(result.selection, {
      kind: 'week', anchor: '2026-11-02', timeZone: 'Europe/Warsaw',
      start: '2026-11-01T23:00:00.000Z', endExclusive: '2026-11-08T23:00:00.000Z',
      observationCutoff: '2026-11-08T23:00:00.000Z', asOf: '2026-11-10T00:00:00.000Z', isPartial: false,
    });
    assert.equal(result.period, 'calendar_week');
  }
  const year = resolveAnalyticsWindow({ calendar: 'week', anchor: '2026-01-01' }, now);
  assert.equal(year.selection.anchor, '2025-12-29');
  assert.equal(year.selection.start, '2025-12-28T23:00:00.000Z');
});

test('calendar month normalizes the first and last day and respects real month lengths', () => {
  for (const [first, last, expectedStart, expectedEnd] of [
    ['2026-10-01', '2026-10-31', '2026-09-30T22:00:00.000Z', '2026-10-31T23:00:00.000Z'],
    ['2024-02-01', '2024-02-29', '2024-01-31T23:00:00.000Z', '2024-02-29T23:00:00.000Z'],
    ['2025-12-01', '2025-12-31', '2025-11-30T23:00:00.000Z', '2025-12-31T23:00:00.000Z'],
  ]) {
    for (const anchor of [first, last]) {
      const result = resolveAnalyticsWindow({ calendar: 'month', anchor }, now);
      assert.equal(result.selection.anchor, first);
      assert.equal(result.selection.start, expectedStart);
      assert.equal(result.selection.endExclusive, expectedEnd);
      assert.equal(result.period, 'calendar_month');
    }
  }
});

test('Warsaw calendar boundaries handle both DST transitions without fixed week or month durations', () => {
  for (const [calendar, anchor, start, end, hours] of [
    ['week', '2026-03-29', '2026-03-22T23:00:00.000Z', '2026-03-29T22:00:00.000Z', 167],
    ['week', '2026-10-25', '2026-10-18T22:00:00.000Z', '2026-10-25T23:00:00.000Z', 169],
    ['month', '2026-03-31', '2026-02-28T23:00:00.000Z', '2026-03-31T22:00:00.000Z', 743],
    ['month', '2026-10-31', '2026-09-30T22:00:00.000Z', '2026-10-31T23:00:00.000Z', 745],
  ]) {
    const result = resolveAnalyticsWindow({ calendar, anchor }, now);
    assert.equal(result.selection.start, start);
    assert.equal(result.selection.endExclusive, end);
    assert.equal((result.to - result.from) / 3600000, hours);
  }
});

test('asOf controls partial calendar periods, rejects future periods and leaves all without artificial boundaries', () => {
  const asOf = '2026-11-02T10:00:00.123Z';
  const week = resolveAnalyticsWindow({ calendar: 'week', anchor: '2026-11-08', asOf }, now);
  assert.equal(week.selection.asOf, asOf);
  assert.equal(week.selection.observationCutoff, asOf);
  assert.equal(week.selection.isPartial, true);
  assert.equal(week.to.toISOString(), asOf);
  const month = resolveAnalyticsWindow({ calendar: 'month', anchor: '2026-11-30', asOf }, now);
  assert.equal(month.selection.anchor, '2026-11-01');
  assert.equal(month.selection.observationCutoff, asOf);
  for (const [calendar, anchor] of [['week', '2026-11-09'], ['month', '2026-12-01'], ['month', '9999-12-01']]) {
    assert.throws(() => resolveAnalyticsWindow({ calendar, anchor, asOf }, now), { status: 400 });
  }
  const all = resolveAnalyticsWindow({ calendar: 'all', asOf }, now);
  assert.deepEqual(all.selection, { kind: 'all', anchor: null, timeZone: 'Europe/Warsaw',
    start: null, endExclusive: null, observationCutoff: asOf, asOf, isPartial: false });
  assert.equal(all.from, null);
});

test('both analytics methods use the same selection mechanism and read the server clock once per request', async () => {
  let clockReads = 0;
  const calls = [];
  const service = createAnalyticsService({
    async summary(...args) { calls.push(args); return { totalHours: '0', totalOrders: '0' }; },
    async details(...args) { calls.push(args); return { weekdays: [], startTimes: [] }; },
  }, () => { clockReads++; return now; });
  const query = { calendar: 'month', anchor: '2026-11-05' };
  const summary = await service.summary(42, undefined, 'gross', query);
  assert.equal(clockReads, 1);
  const details = await service.details(42, undefined, 'all', 'gross', { ...query, asOf: summary.selection.asOf });
  assert.equal(clockReads, 2);
  assert.deepEqual(summary.selection, details.selection);
  assert.equal(calls[0][4], summary.selection);
  assert.deepEqual(calls[0][5], summary.comparison.previousWindow);
  assert.equal(calls[1].at(-1), details.selection);
  assert.equal(summary.selection.asOf, now.toISOString());
  assert.equal(Object.hasOwn(await service.summary(42, 'all'), 'selection'), false);
});

function previous(calendar, anchor, asOf) {
  return resolvePreviousWindow(resolveAnalyticsWindow({ calendar, anchor }, new Date(asOf)).selection);
}

test('previous historical windows use complete calendar weeks and real months, including January to December', () => {
  for (const [calendar, anchor, start, end] of [
    ['week', '2026-10-26', '2026-10-18T22:00:00.000Z', '2026-10-25T23:00:00.000Z'],
    ['month', '2026-03-01', '2026-01-31T23:00:00.000Z', '2026-02-28T23:00:00.000Z'],
    ['month', '2024-03-01', '2024-01-31T23:00:00.000Z', '2024-02-29T23:00:00.000Z'],
    ['month', '2026-01-01', '2025-11-30T23:00:00.000Z', '2025-12-31T23:00:00.000Z'],
  ]) {
    const result = previous(calendar, anchor, '2026-11-10T12:00:00Z');
    assert.equal(result.start, start);
    assert.equal(result.endExclusive, end);
    assert.equal(result.observationCutoff, end);
    assert.equal(result.isPartial, false);
    assert.equal(result.monthEndClamped, false);
    assert.equal(result.dstAdjustment, null);
  }
});

test('partial week maps the same local weekday and time, preserving seconds and milliseconds across DST', () => {
  const regular = previous('week', '2026-11-04', '2026-11-04T14:30:45.123Z');
  assert.equal(regular.observationCutoff, '2026-10-28T14:30:45.123Z');
  assert.equal(regular.isPartial, true);
  const dst = previous('week', '2026-10-28', '2026-10-28T14:30:45.123Z');
  assert.equal(dst.observationCutoff, '2026-10-21T13:30:45.123Z');
  assert.equal(dst.dstAdjustment, null); // Different offsets are not a correction of a missing/repeated time.
});

test('partial month maps calendar day and local clock, saturating absent days to the shorter month end', () => {
  for (const [asOf, anchor, cutoff, clamped] of [
    ['2026-11-02T14:00:12.345Z', '2026-11-01', '2026-10-02T13:00:12.345Z', false],
    ['2026-03-31T13:00:00Z', '2026-03-01', '2026-02-28T23:00:00.000Z', true],
    ['2024-03-31T13:00:00Z', '2024-03-01', '2024-02-29T23:00:00.000Z', true],
    ['2026-05-31T13:00:00Z', '2026-05-01', '2026-04-30T22:00:00.000Z', true],
    ['2026-04-30T13:00:00Z', '2026-04-01', '2026-03-30T13:00:00.000Z', false],
    ['2026-01-02T14:00:00Z', '2026-01-01', '2025-12-02T14:00:00.000Z', false],
  ]) {
    const result = previous('month', anchor, asOf);
    assert.equal(result.observationCutoff, cutoff);
    assert.equal(result.monthEndClamped, clamped);
    assert.equal(result.isPartial, !clamped);
  }
});

test('partial week and month follow DEC-031 for missing and repeated Warsaw local times', () => {
  for (const [calendar, anchor, asOf, cutoff, adjustment] of [
    ['week', '2026-04-05', '2026-04-05T00:30:15.123Z', '2026-03-29T01:30:15.123Z', 'nonexistent_time_shifted_forward'],
    ['month', '2026-04-01', '2026-04-29T00:30:15.123Z', '2026-03-29T01:30:15.123Z', 'nonexistent_time_shifted_forward'],
    ['week', '2026-11-01', '2026-11-01T01:30:15.123Z', '2026-10-25T00:30:15.123Z', 'repeated_time_earlier'],
    ['month', '2026-11-01', '2026-11-25T01:30:15.123Z', '2026-10-25T00:30:15.123Z', 'repeated_time_earlier'],
  ]) {
    const result = previous(calendar, anchor, asOf);
    assert.equal(result.observationCutoff, cutoff);
    assert.equal(result.dstAdjustment, adjustment);
    assert.ok(result.observationCutoff <= result.endExclusive);
  }
});

test('all and legacy selections have no previous window', () => {
  assert.equal(resolvePreviousWindow(resolveAnalyticsWindow({ calendar: 'all' }, now).selection), null);
  assert.equal(resolvePreviousWindow(resolveAnalyticsWindow({ period: 'all' }, now).selection), null);
});
