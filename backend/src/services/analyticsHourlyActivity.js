import { dateFromMicroseconds, intersectWarsawBuckets, intersectWarsawDayBuckets,
  warsawBucketKey, warsawWeekdayKey } from './analyticsWindow.js';

const hourLabel = hour => `${String(hour * 2).padStart(2, '0')}:00–${String(hour * 2 + 2).padStart(2, '0')}:00`;
const weekdayLabels = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

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
  // Pory dnia (12) dla prostego widoku tygodnia i siatka dzień×pora (84) dla mapy cieplnej.
  const durations = Array(12).fill(0n), counts = Array(12).fill(0);
  const cellDurations = Array(84).fill(0n), cellCounts = Array(84).fill(0);
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
    const cellIntersections = intersectWarsawDayBuckets(shift.start, shift.end);
    for (let i = 0; i < 84; i++) cellDurations[i] += cellIntersections[i];
    for (const event of valid) {
      if (eventPlatform === 'all' || event.platform === eventPlatform) {
        const at = dateFromMicroseconds(BigInt(event.clickedAtUs));
        const hour = Number(warsawBucketKey(at));
        counts[hour]++;
        cellCounts[(Number(warsawWeekdayKey(at)) - 1) * 12 + hour]++;
      }
    }
  }
  quality.excludedEventCount = quality.invalidEventCount + quality.overlapEventCount;
  const available = quality.includedShiftCount > 0;
  const emptyReason = available ? null : !shifts.length ? 'no_completed_shifts'
    : !eventCount ? 'no_events' : quality.overlapEventCount ? 'overlapping_shifts' : 'no_valid_events';
  const cells = cellDurations.map((duration, i) => ({ weekday: Math.floor(i / 12) + 1, hour: i % 12,
    workMicroseconds: duration.toString(), registeredOrders: cellCounts[i] }));
  // Pokrycie danych decyduje, czy mapa 7×12 ma sens, czy pokazać prostszy widok godzinowy.
  const activeCells = cells.filter(cell => cell.workMicroseconds !== '0').length;
  const activeWeekdays = new Set(cells.filter(cell => cell.workMicroseconds !== '0').map(cell => cell.weekday)).size;
  return { eventPlatform, timeZone: 'Europe/Warsaw', asOf: new Date(asOf).toISOString(),
    mode: eventPlatform === 'all' ? 'rate' : 'count', status: available ? 'available' : 'no_data',
    emptyReason, quality, weekdayLabels,
    coverage: { activeCells, activeWeekdays },
    groups: durations.map((duration, i) => ({ key: String(i), label: hourLabel(i),
      workMicroseconds: duration.toString(), registeredOrders: counts[i] })),
    cells };
}

// Minimalne pokrycie, przy którym mapa 7×12 niesie wzorzec, a nie szum pojedynczych zmian.
// Poniżej tego front pokazuje prostszy widok godzinowy (12 słupków).
const HEATMAP_MIN_CELLS = 8;
const HEATMAP_MIN_WEEKDAYS = 3;

// To samo zaokrąglenie co ROUND(..., 2) w SQL: kwoty są nieujemne, więc pół w górę wystarcza.
function roundRate(orders, micros) {
  if (micros <= 0n) return null;
  return (Math.round(Number(orders) * 3600000000 / Number(micros) * 100) / 100);
}

export function finishHourlyActivity(activity, { groups, bestRate }) {
  const ranked = activity.mode === 'rate';
  const positive = bestRate !== null && bestRate !== '0.00';
  // Wartość komórki: w trybie 'rate' — dostawy/h, w trybie 'count' — liczba dostaw. Brak czasu pracy = null (pusta komórka).
  const cells = activity.cells.map(cell => {
    const micros = BigInt(cell.workMicroseconds);
    const worked = micros > 0n;
    const value = !worked ? null : ranked ? roundRate(cell.registeredOrders, micros) : cell.registeredOrders;
    return { weekday: cell.weekday, hour: cell.hour, label: `${activity.weekdayLabels[cell.weekday - 1]} ${hourLabel(cell.hour)}`,
      status: worked ? 'available' : 'no_data', registeredOrders: worked ? cell.registeredOrders : null, value };
  });
  // Najcieplejsza komórka: najwyższa wartość dodatnia. Bez niej (same zera / brak danych) nie zgadujemy wzorca.
  const best = cells.reduce((top, cell) => (cell.value && (!top || cell.value > top.value)) ? cell : top, null);
  const { activeCells, activeWeekdays } = activity.coverage;
  const sufficient = activeCells >= HEATMAP_MIN_CELLS && activeWeekdays >= HEATMAP_MIN_WEEKDAYS;
  return { ...activity, groups, cells,
    coverage: { ...activity.coverage, sufficient },
    best: best ? { weekday: best.weekday, hour: best.hour, label: best.label, value: best.value } : null,
    bestIntervals: {
      status: !ranked ? 'unavailable' : bestRate === null ? 'no_data' : positive ? 'available' : 'all_zero',
      registeredOrdersPerHour: ranked ? bestRate : null,
      keys: ranked && positive ? groups.filter(group => group.registeredOrdersPerHour === bestRate).map(group => group.key) : [],
    } };
}
