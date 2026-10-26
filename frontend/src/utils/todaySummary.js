const warsawDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' });

// The API aggregates before rounding, including in estimated_net mode.
export function todayEarningsFromTrend(trend, now = new Date()) {
  return trend.find(({ key }) => key === warsawDate.format(now))?.totalEarnings ?? '0.00';
}

// Present existing shift totals for the Warsaw day of their start, like analytics.
export function todaySummary(shifts, now = new Date()) {
  const today = warsawDate.format(now);
  const completed = shifts.filter((shift) => shift.status === 'completed'
    && new Date(shift.startedAt) <= now && warsawDate.format(new Date(shift.startedAt)) === today);
  const included = completed.filter((shift) => shift.platformEntries.length > 0);
  const distanceShifts = included.filter((shift) => shift.distanceKm !== null);
  return {
    totalEarnings: (included.reduce((sum, shift) => sum + Math.round(Number(shift.totalEarnings) * 100), 0) / 100).toFixed(2),
    totalOrders: included.reduce((sum, shift) => sum + shift.totalOrders, 0),
    durationSeconds: included.reduce((sum, shift) => sum + shift.durationSeconds, 0),
    distanceKm: distanceShifts.length ? (distanceShifts.reduce((sum, shift) => sum + Math.round(Number(shift.distanceKm) * 100), 0) / 100).toFixed(2) : null,
    incompleteCount: completed.length - included.length,
  };
}
