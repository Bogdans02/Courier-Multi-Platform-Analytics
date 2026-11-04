const warsawDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
});
const weekLabel = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
});
const monthLabel = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export function initialAnalyticsCalendar(now = new Date()) {
  return { kind: 'week', anchors: { week: warsawDate.format(now), month: null } };
}

export function selectAnalyticsCalendar(state, kind, currentDate) {
  return { ...state, kind, anchors: kind === 'all' ? state.anchors
    : { ...state.anchors, [kind]: state.anchors[kind] ?? currentDate } };
}

// These UTC Dates contain calendar labels only. Backend selection owns the real
// Warsaw boundaries, observation cutoff and DST; none are recalculated here.
export function calendarAnchor(kind, date) {
  const value = new Date(`${date}T00:00:00Z`);
  if (kind === 'week') value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  else value.setUTCDate(1);
  return value.toISOString().slice(0, 10);
}

export function adjacentCalendarAnchor(kind, anchor, direction) {
  const date = new Date(`${calendarAnchor(kind, anchor)}T00:00:00Z`);
  if (kind === 'week') date.setUTCDate(date.getUTCDate() + direction * 7);
  else date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 10);
}

export function calendarPeriodLabel(kind, anchor) {
  const first = new Date(`${calendarAnchor(kind, anchor)}T00:00:00Z`);
  if (kind === 'month') {
    const label = monthLabel.format(first);
    return label.charAt(0).toLocaleUpperCase('pl-PL') + label.slice(1);
  }
  const last = new Date(first);
  last.setUTCDate(last.getUTCDate() + 6);
  return weekLabel.formatRange(first, last);
}

export function calendarPeriodOptions(kind, range) {
  if (kind === 'all' || !range) return [];
  const first = calendarAnchor(kind, range.earliestDate ?? range.currentDate);
  const options = [];
  for (let anchor = calendarAnchor(kind, range.currentDate); anchor >= first;
    anchor = adjacentCalendarAnchor(kind, anchor, -1)) {
    options.push({ anchor, label: calendarPeriodLabel(kind, anchor) });
  }
  return options;
}

export function canStepAnalyticsCalendar(state, direction, range) {
  if (state.kind === 'all' || !range) return false;
  const next = adjacentCalendarAnchor(state.kind, state.anchors[state.kind], direction);
  return next >= calendarAnchor(state.kind, range.earliestDate ?? range.currentDate)
    && next <= calendarAnchor(state.kind, range.currentDate);
}

export function stepAnalyticsCalendar(state, direction, range) {
  if (!canStepAnalyticsCalendar(state, direction, range)) return state;
  return { ...state, anchors: { ...state.anchors,
    [state.kind]: adjacentCalendarAnchor(state.kind, state.anchors[state.kind], direction) } };
}
