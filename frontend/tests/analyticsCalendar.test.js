import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { initialAnalyticsCalendar, selectAnalyticsCalendar, calendarAnchor, calendarPeriodLabel,
  adjacentCalendarAnchor, calendarPeriodOptions, canStepAnalyticsCalendar, stepAnalyticsCalendar } from '../src/utils/analyticsCalendar.js';

test('analytics opens the current Warsaw week and remembers week and month separately, with the server date for the first month', () => {
  let state = initialAnalyticsCalendar(new Date('2026-11-01T23:30:00Z'));
  assert.deepEqual(state, { kind: 'week', anchors: { week: '2026-11-02', month: null } });
  state = { ...state, anchors: { ...state.anchors, week: '2026-10-19' } };
  state = selectAnalyticsCalendar(state, 'month', '2026-11-04');
  assert.equal(state.anchors.month, '2026-11-04');
  state = { ...state, anchors: { ...state.anchors, month: '2026-09-01' } };
  state = selectAnalyticsCalendar(state, 'all', '2026-11-04');
  assert.equal(state.kind, 'all');
  state = selectAnalyticsCalendar(state, 'week', '2026-11-04');
  assert.equal(state.anchors.week, '2026-10-19');
  state = selectAnalyticsCalendar(state, 'month', '2026-11-04');
  assert.equal(state.anchors.month, '2026-09-01');
});

test('weekly navigation follows calendar dates across DST and obeys both server bounds during rapid changes', () => {
  const range = { earliestDate: '2026-10-20', currentDate: '2026-11-04' };
  const initial = initialAnalyticsCalendar(new Date('2026-11-04T12:00:00Z'));
  assert.equal(canStepAnalyticsCalendar(initial, 1, range), false);
  assert.equal(stepAnalyticsCalendar(initial, 1, range), initial);
  const previous = stepAnalyticsCalendar(initial, -1, range);
  assert.equal(previous.anchors.week, '2026-10-26');
  assert.equal(stepAnalyticsCalendar(previous, 1, range).anchors.week, '2026-11-02');
  const earliest = stepAnalyticsCalendar(previous, -1, range);
  assert.equal(earliest.anchors.week, '2026-10-19');
  assert.equal(canStepAnalyticsCalendar(earliest, -1, range), false);
  assert.equal(stepAnalyticsCalendar(earliest, 1, range).anchors.week, '2026-10-26');
  assert.equal(adjacentCalendarAnchor('week', '2026-03-23', 1), '2026-03-30');
  assert.equal(canStepAnalyticsCalendar(initial, -1, null), false);
});

test('monthly navigation handles unequal months and year boundaries, with future months blocked by the server date', () => {
  const range = { earliestDate: '2023-12-25', currentDate: '2024-03-31' };
  const state = selectAnalyticsCalendar(initialAnalyticsCalendar(new Date('2024-03-31T12:00:00Z')), 'month', range.currentDate);
  assert.equal(canStepAnalyticsCalendar(state, 1, range), false);
  const february = stepAnalyticsCalendar(state, -1, range);
  assert.equal(february.anchors.month, '2024-02-01');
  assert.equal(stepAnalyticsCalendar(february, 1, range).anchors.month, '2024-03-01');
  assert.equal(adjacentCalendarAnchor('month', '2024-01-31', -1), '2023-12-01');
  assert.equal(calendarAnchor('week', '2026-01-01'), '2025-12-29');
  assert.equal(calendarPeriodLabel('month', '2026-11-04'), 'Listopad 2026');
  const label = calendarPeriodLabel('week', '2026-11-04');
  assert.match(label, /2.*8.*lis.*2026/);
});

test('period choices include empty months and weeks, while no history offers only the current period and all needs no list', () => {
  const range = { earliestDate: '2026-01-15', currentDate: '2026-03-04' };
  assert.deepEqual(calendarPeriodOptions('month', range).map(option => option.anchor), ['2026-03-01', '2026-02-01', '2026-01-01']);
  assert.deepEqual(calendarPeriodOptions('week', { earliestDate: '2025-12-31', currentDate: '2026-01-07' }).map(option => option.anchor),
    ['2026-01-05', '2025-12-29']);
  const empty = { earliestDate: null, currentDate: '2026-11-04' };
  assert.deepEqual(calendarPeriodOptions('week', empty).map(option => option.anchor), ['2026-11-02']);
  assert.deepEqual(calendarPeriodOptions('month', empty).map(option => option.anchor), ['2026-11-01']);
  assert.deepEqual(calendarPeriodOptions('all', range), []);
  assert.equal(canStepAnalyticsCalendar({ kind: 'all', anchors: {} }, -1, range), false);
});

test('React period selector renders normalized choices, disables future navigation and hides navigation for all', async (t) => {
  const server = await createServer({ server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  t.after(() => server.close());
  const Selector = (await server.ssrLoadModule('/src/components/AnalyticsPeriodSelector.jsx')).default;
  const initial = initialAnalyticsCalendar(new Date('2026-11-04T12:00:00Z'));
  const range = { earliestDate: '2026-09-01', currentDate: '2026-11-04' };
  const render = (selection, available = range) => renderToStaticMarkup(createElement(Selector, {
    selection, range: available, onKindChange() {}, onAnchorChange() {}, onStep() {},
  }));
  const week = render(initial);
  assert.match(week, /value="2026-11-02" selected/);
  assert.match(week, /aria-label="Następny tydzień" disabled/);
  const month = selectAnalyticsCalendar(initial, 'month', range.currentDate);
  const markup = render(month);
  assert.match(markup, /Listopad 2026/);
  assert.match(markup, /aria-label="Następny miesiąc" disabled/);
  assert.match(markup, /value="2026-10-01"/);
  const noHistory = render(initial, { ...range, earliestDate: null });
  assert.equal((noHistory.match(/<option /g) ?? []).length, 1);
  assert.match(noHistory, /aria-label="Poprzedni tydzień" disabled/);
  assert.doesNotMatch(render(selectAnalyticsCalendar(initial, 'all', range.currentDate)),
    /<select|analytics-period-navigation/);
});
