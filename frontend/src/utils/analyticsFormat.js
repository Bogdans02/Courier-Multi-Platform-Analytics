import { platforms } from './platformEntries.js';
import { adjacentCalendarAnchor } from './analyticsCalendar.js';

const weekdays = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const startTimes = ['00:00–06:00', '06:00–12:00', '12:00–18:00', '18:00–24:00'];

// Only axis labels are shortened; table labels and chart source data stay complete.
export function analyticsAxisLabel(label) {
  if (Array.isArray(label)) return label;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(label)) return label.slice(0, 5);
  const day = weekdays.indexOf(label);
  if (day >= 0) return ['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'][day];
  if (/^\d{4}-\d{2}$/.test(label)) return `${label.slice(5)}.${label.slice(0, 4)}`;
  if (/^\d{2}:\d{2}–\d{2}:\d{2}$/.test(label)) return [`${label.slice(0, 5)}–`, label.slice(6)];
  return label;
}

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

export function analyticsChartData(kind, rows, metric = 'totalEarnings') {
  return {
    labels: rows.map((row) => analyticsLabel(kind, row)),
    // No sample is distinct from a measured zero.
    values: rows.map((row) => row.shiftCount && row[metric] != null ? Number(row[metric]) : null),
  };
}

export const efficiencyMetrics = [
  { key: 'totalEarnings', label: 'Zarobek', unit: 'zł' },
  { key: 'earningsPerHour', label: 'Zł/h', unit: 'zł/h' },
  { key: 'ordersPerHour', label: 'Dostawy/h', unit: 'dostawy/h' },
];

export function efficiencyTrend(details, selection, availableRange) {
  const monthly = selection.kind === 'all';
  const kind = monthly ? 'months' : 'trend';
  const groups = new Map(details[kind].map(row => [row.key, row]));
  const currentDate = availableRange?.currentDate ?? new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(selection.asOf));
  const first = monthly ? availableRange?.earliestDate?.slice(0, 7) ?? details.months[0]?.key ?? currentDate.slice(0, 7)
    : selection.anchor;
  const end = monthly ? currentDate.slice(0, 7)
    : adjacentCalendarAnchor(selection.kind, selection.anchor, 1);
  const rows = [];
  // Pad labels only. Missing observations stay NULL; no aggregates are computed here.
  const date = new Date(`${monthly ? `${first}-01` : first}T00:00:00Z`);
  for (let key = first; monthly ? key <= end : key < end;
    key = date.toISOString().slice(0, monthly ? 7 : 10)) {
    rows.push(groups.get(key) ?? { key, shiftCount: 0, totalEarnings: null, earningsPerHour: null, ordersPerHour: null });
    if (monthly) date.setUTCMonth(date.getUTCMonth() + 1);
    else date.setUTCDate(date.getUTCDate() + 1);
  }
  return { kind, rows };
}
