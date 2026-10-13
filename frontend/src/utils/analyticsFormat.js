import { platforms } from './platformEntries.js';

const weekdays = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const startTimes = ['00:00–06:00', '06:00–12:00', '12:00–18:00', '18:00–24:00'];

export function analyticsLabel(kind, row) {
  if (kind === 'weekdays') return weekdays[Number(row.key) - 1];
  if (kind === 'startTimes') return startTimes[Number(row.key)];
  if (kind === 'platforms') return platforms.find(({ value }) => value === row.platform)?.label ?? row.platform;
  if (kind === 'trend') {
    const [year, month, day] = row.key.split('-');
    return `${day}.${month}.${year}`;
  }
  return row.key;
}

export function analyticsChartData(kind, rows) {
  return {
    labels: rows.map((row) => analyticsLabel(kind, row)),
    // No sample is distinct from a measured zero.
    values: rows.map((row) => row.shiftCount ? Number(row.totalEarnings) : null),
  };
}
