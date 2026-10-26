import test from 'node:test';
import assert from 'node:assert/strict';
import { weekChartData } from '../src/utils/weekChart.js';

test('weekly chart keeps all seven Warsaw dates, including missing days and Sunday', () => {
  const result = weekChartData([
    { key: '2026-10-18', shiftCount: 1, totalEarnings: '999.00' },
    { key: '2026-10-19', shiftCount: 2, totalEarnings: '123.45' },
    { key: '2026-10-21', shiftCount: 1, totalEarnings: '0.00' },
    { key: '2026-10-25', shiftCount: 1, totalEarnings: '15.50' },
  ], '2026-10-18T22:00:00Z');
  assert.deepEqual(result.labels, [ ['19.10', 'pon.'], ['20.10', 'wt.'], ['21.10', 'śr.'],
    ['22.10', 'czw.'], ['23.10', 'pt.'], ['24.10', 'sob.'], ['25.10', 'niedz.'] ]);
  assert.deepEqual(result.values, [123.45, null, 0, null, null, null, 15.5]);
  assert.equal(result.range, '19 paź. - 25 paź.');
});

test('empty weekly chart keeps dates across a year boundary without inventing earnings', () => {
  const result = weekChartData([], '2025-12-28T23:00:00Z');
  assert.equal(result.range, '29 gru. - 4 sty.');
  assert.equal(result.labels[6][1], 'niedz.');
  assert.deepEqual(result.values, Array(7).fill(null));
});
