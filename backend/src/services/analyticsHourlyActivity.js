import { dateFromMicroseconds, intersectWarsawBuckets, warsawBucketKey } from './analyticsWindow.js';

export function aggregateHourlyActivity(rows, asOf, eventPlatform) {
  const cutoffUs = BigInt(new Date(asOf).getTime()) * 1000n;
  const shifts = rows.map(row => ({ ...row, start: BigInt(row.startedAtUs), end: BigInt(row.endedAtUs) }))
    .sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  // Sweep the whole cohort, including shifts without events. Touching ends do
  // not overlap. The furthest-ending earlier shift detects nested intervals too.
  const overlapping = new Set();
  let furthest = null;
  for (const shift of shifts) {
    if (furthest && shift.start < furthest.end) {
      overlapping.add(furthest.id);
      overlapping.add(shift.id);
    }
    if (!furthest || shift.end > furthest.end) furthest = shift;
  }
  const durations = Array(12).fill(0n), counts = Array(12).fill(0);
  const quality = { coverageStatus: 'unknown', cohortShiftCount: shifts.length,
    includedShiftCount: 0, shiftsWithoutValidEvents: 0, invalidEventCount: 0,
    excludedOverlapShiftCount: overlapping.size, overlapEventCount: 0, excludedEventCount: 0 };
  let eventCount = 0;
  for (const shift of shifts) {
    eventCount += shift.events.length;
    const valid = shift.events.filter(event => {
      const time = BigInt(event.clickedAtUs);
      return time >= shift.start && time < shift.end && time <= cutoffUs;
    });
    quality.invalidEventCount += shift.events.length - valid.length;
    if (!valid.length) quality.shiftsWithoutValidEvents++;
    if (overlapping.has(shift.id)) {
      quality.overlapEventCount += valid.length;
      continue;
    }
    if (!valid.length) continue;
    quality.includedShiftCount++;
    const intersections = intersectWarsawBuckets(shift.start, shift.end);
    for (let i = 0; i < 12; i++) durations[i] += intersections[i];
    for (const event of valid) {
      if (eventPlatform === 'all' || event.platform === eventPlatform) {
        counts[Number(warsawBucketKey(dateFromMicroseconds(BigInt(event.clickedAtUs))))]++;
      }
    }
  }
  quality.excludedEventCount = quality.invalidEventCount + quality.overlapEventCount;
  const available = quality.includedShiftCount > 0;
  const emptyReason = available ? null : !shifts.length ? 'no_completed_shifts'
    : !eventCount ? 'no_events' : quality.overlapEventCount ? 'overlapping_shifts' : 'no_valid_events';
  return { eventPlatform, timeZone: 'Europe/Warsaw', asOf: new Date(asOf).toISOString(),
    mode: eventPlatform === 'all' ? 'rate' : 'count', status: available ? 'available' : 'no_data',
    emptyReason, quality, groups: durations.map((duration, i) => ({ key: String(i),
      label: `${String(i * 2).padStart(2, '0')}:00–${String(i * 2 + 2).padStart(2, '0')}:00`,
      workMicroseconds: duration.toString(), registeredOrders: counts[i] })) };
}

export function finishHourlyActivity(activity, { groups, bestRate }) {
  const ranked = activity.mode === 'rate';
  const positive = bestRate !== null && bestRate !== '0.00';
  return { ...activity, groups, bestIntervals: {
    status: !ranked ? 'unavailable' : bestRate === null ? 'no_data' : positive ? 'available' : 'all_zero',
    registeredOrdersPerHour: ranked ? bestRate : null,
    keys: ranked && positive ? groups.filter(group => group.registeredOrdersPerHour === bestRate).map(group => group.key) : [],
  } };
}
