import { validateCalendarSelection, validateSummaryPeriod } from '../validators/analyticsValidator.js';
import { httpError } from '../utils/httpError.js';

const timeZone = 'Europe/Warsaw';
const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
});
const localOffset = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' });
const localTime = new Intl.DateTimeFormat('en-GB', {
  timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit',
  fractionalSecondDigits: 3, hourCycle: 'h23',
});

function offsetMilliseconds(instant) {
  const offset = localOffset.formatToParts(instant).find((part) => part.type === 'timeZoneName').value;
  const [, sign, hours, minutes, seconds = '0'] = offset.match(/^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/);
  const offsetSeconds = (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * (sign === '+' ? 1 : -1);
  return offsetSeconds * 1000;
}

// UTC Dates here are containers for local calendar components, not real instants.
function wallTime(instant) {
  const parts = Object.fromEntries(localTime.formatToParts(instant).map(({ type, value }) => [type, value]));
  return new Date(`${localDate.format(instant)}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}Z`);
}

function warsawTime(wall) {
  // Inspect offsets on both sides of the target date using the same Intl mechanism
  // as calendar boundaries. A repeated time has two matches; a gap has none.
  const offsets = new Set([-1, 0, 1].map(days => offsetMilliseconds(new Date(wall.getTime() + days * 86400000))));
  const candidates = [...offsets].map(offset => new Date(wall.getTime() - offset)).sort((a, b) => a - b);
  const matches = candidates.filter(instant => wallTime(instant).getTime() === wall.getTime());
  if (matches.length) return { instant: matches[0], dstAdjustment: matches.length > 1 ? 'repeated_time_earlier' : null };
  // DEC-031: shift a nonexistent time forward by the gap, preserving minutes.
  const instant = candidates.find(candidate => wallTime(candidate) > wall);
  return { instant, dstAdjustment: 'nonexistent_time_shifted_forward' };
}

function warsawMidnight(date) {
  return warsawTime(new Date(`${date}T00:00:00.000Z`)).instant;
}

export function resolvePreviousWindow(selection) {
  if (!selection || selection.kind === 'all') return null;
  const { kind, anchor, asOf, isPartial } = selection;
  const date = new Date(`${anchor}T00:00:00.000Z`);
  if (kind === 'week') date.setUTCDate(date.getUTCDate() - 7);
  else date.setUTCMonth(date.getUTCMonth() - 1);
  const previousAnchor = date.toISOString().slice(0, 10);
  const endExclusive = new Date(selection.start);
  let cutoff = endExclusive;
  let monthEndClamped = false;
  let dstAdjustment = null;
  if (isPartial) {
    const target = wallTime(new Date(selection.observationCutoff));
    if (kind === 'week') target.setUTCDate(target.getUTCDate() - 7);
    else {
      const day = target.getUTCDate();
      target.setUTCDate(1);
      target.setUTCMonth(target.getUTCMonth() - 1);
      const monthEnd = new Date(date);
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
      monthEnd.setUTCDate(0);
      const lastDay = monthEnd.getUTCDate();
      monthEndClamped = day > lastDay;
      if (!monthEndClamped) target.setUTCDate(day);
    }
    if (!monthEndClamped) {
      const mapped = warsawTime(target);
      cutoff = mapped.instant < endExclusive ? mapped.instant : endExclusive;
      dstAdjustment = mapped.dstAdjustment;
    }
  }
  return {
    kind, anchor: previousAnchor, timeZone, start: warsawMidnight(previousAnchor).toISOString(),
    endExclusive: endExclusive.toISOString(), observationCutoff: cutoff.toISOString(), asOf,
    isPartial: cutoff < endExclusive, monthEndClamped, dstAdjustment,
  };
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
