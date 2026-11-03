import { validateCalendarSelection, validateSummaryPeriod } from '../validators/analyticsValidator.js';
import { httpError } from '../utils/httpError.js';

const timeZone = 'Europe/Warsaw';
const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
});
const localOffset = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' });

function warsawMidnight(date) {
  const midnight = new Date(`${date}T00:00:00.000Z`);
  // This UTC value is only a calendar-date container. Apply Warsaw's offset
  // separately for each boundary, so a DST week is not assumed to have 168 hours.
  const offset = localOffset.formatToParts(midnight).find((part) => part.type === 'timeZoneName').value;
  const [, sign, hours, minutes, seconds = '0'] = offset.match(/^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/);
  const offsetSeconds = (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * (sign === '+' ? 1 : -1);
  return new Date(midnight.getTime() - offsetSeconds * 1000);
}

// Keep the legacy inclusive bounds, including Start's current_week, unchanged.
function legacyWindow(value, to) {
  const period = validateSummaryPeriod(value);
  if (period === 'current_week') {
    const date = localDate.format(to);
    const monday = new Date(`${date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const offsetHours = Number(new Intl.DateTimeFormat('en-GB', { timeZone,
      hour: '2-digit', hourCycle: 'h23' }).format(monday));
    monday.setUTCHours(-offsetHours);
    return { period, from: monday, to };
  }
  const days = { week: 7, month: 30, three_months: 90 }[period];
  return { period, from: days ? new Date(to.getTime() - days * 86400000) : null, to };
}

export function resolveAnalyticsWindow(query, now) {
  const calendar = validateCalendarSelection(query, now);
  if (!calendar) return legacyWindow(query.period, now);
  const { calendar: kind, asOf } = calendar;
  let anchor = null;
  let start = null;
  let endExclusive = null;
  if (kind !== 'all') {
    // Arithmetic on date components, not a claim that local days last 24 hours.
    const date = new Date(`${calendar.anchor}T00:00:00.000Z`);
    if (kind === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    else date.setUTCDate(1);
    anchor = date.toISOString().slice(0, 10);
    start = warsawMidnight(anchor);
    if (start > asOf) throw httpError(400, 'Nie można wybrać przyszłego okresu względem asOf.');
    if (kind === 'week') date.setUTCDate(date.getUTCDate() + 7);
    else date.setUTCMonth(date.getUTCMonth() + 1);
    endExclusive = warsawMidnight(date.toISOString().slice(0, 10));
  }
  const observationCutoff = endExclusive && endExclusive < asOf ? endExclusive : asOf;
  return {
    period: kind === 'all' ? 'all' : `calendar_${kind}`,
    from: start,
    to: observationCutoff,
    selection: {
      kind, anchor, timeZone, start: start?.toISOString() ?? null,
      endExclusive: endExclusive?.toISOString() ?? null,
      observationCutoff: observationCutoff.toISOString(), asOf: asOf.toISOString(),
      isPartial: endExclusive !== null && asOf < endExclusive,
    },
  };
}
