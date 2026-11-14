import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDate, formatDateTime, formatDay, formatMonth, formatTime, formatTimeRange, formatWeekRange } from '../src/utils/dateFormat.js';

// Local dates keep the expectations independent of the computer's time zone.
const morning = new Date(2026, 10, 8, 8, 5, 59);

test('times have hours and minutes only, never seconds', () => {
  assert.equal(formatTime(morning), '08:05');
  assert.equal(formatDateTime(morning), 'Niedziela, 8 listopada, 08:05');
});

test('days start with a capital letter and use the full month name', () => {
  assert.equal(formatDay(morning), 'Niedziela, 8 listopada');
  assert.equal(formatDay(new Date(2026, 10, 11)), 'Środa, 11 listopada');
});

test('a calendar date such as an expense date is read as a local day, not UTC midnight', () => {
  assert.equal(formatDate('2026-11-03'), '3 listopada 2026');
  assert.equal(formatDate('2026-01-01'), '1 stycznia 2026');
});

test('a time range adds the end day only when the shift ends on another day', () => {
  assert.equal(formatTimeRange(morning, new Date(2026, 10, 8, 12, 0, 30)), '08:05 – 12:00');
  assert.equal(formatTimeRange(new Date(2026, 10, 8, 22, 0), new Date(2026, 10, 9, 2, 0)), '22:00 – 02:00 (9 listopada)');
});

test('weeks and months use the same labels in Start, Historia and Analiza', () => {
  assert.equal(formatWeekRange('2026-11-02'), '2–8 lis 2026');
  assert.equal(formatWeekRange('2025-12-29'), '29 gru 2025–4 sty 2026');
  assert.equal(formatMonth('2026-11-01'), 'Listopad 2026');
});
