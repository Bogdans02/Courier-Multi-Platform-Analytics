import { validateAnalyticsPlatform, validateEarningsMode } from '../validators/analyticsValidator.js';
import { httpError } from '../utils/httpError.js';
import { resolveAnalyticsWindow, resolvePreviousWindow } from './analyticsWindow.js';
import { aggregateHourlyActivity, finishHourlyActivity } from './analyticsHourlyActivity.js';

function emptyGroup(key, platform) {
  return { key, shiftCount: 0, totalEarnings: '0.00', totalOrders: 0,
    earningsPerOrder: null, earningsPerHour: null,
    totalHours: platform === 'all' ? 0 : null, ordersPerHour: null };
}

function bestWeekdays(groups) {
  // SQL orders by the rounded NUMERIC rate. Compare its text directly, without
  // recalculating money or introducing floating-point differences in a tie.
  const best = groups.find(group => group.earningsPerHour !== null);
  if (!best) return { status: 'no_data', earningsPerHour: null, days: [] };
  if (best.earningsPerHour === '0.00') return { status: 'all_zero', earningsPerHour: '0.00', days: [] };
  return { status: 'available', earningsPerHour: best.earningsPerHour,
    days: groups.filter(group => group.earningsPerHour === best.earningsPerHour)
      .sort((a, b) => Number(a.key) - Number(b.key)) };
}

export function createAnalyticsService(analytics, clock = () => new Date(), settings) {
  async function earningsSettings(userId, value) {
    const mode = validateEarningsMode(value);
    if (mode === 'gross') return { mode, deductionRate: '0' };
    const saved = await settings.get(userId);
    if (!saved.netProfile || saved.deductionRate === null) {
      throw httpError(409, 'Najpierw zapisz profil w ustawieniach szacowanego netto.');
    }
    return { mode, deductionRate: saved.deductionRate };
  }
  return {
    async summary(userId, value, modeValue, calendarQuery = {}) {
      const { period, from, to, selection } = resolveAnalyticsWindow({ ...calendarQuery, period: value }, clock());
      const { mode, deductionRate } = await earningsSettings(userId, modeValue);
      const previousWindow = resolvePreviousWindow(selection);
      const row = await analytics.summary(userId, from, to, deductionRate, ...(selection ? [selection, previousWindow] : []));
      const availableRange = selection ? await analytics.availableRange(userId, selection.asOf) : undefined;
      const { comparison, ...values } = row;
      return {
        period, mode, deductionRate: mode === 'estimated_net' ? deductionRate : null,
        from: from?.toISOString() ?? null,
        to: to.toISOString(),
        ...(selection && { selection, availableRange }),
        ...values,
        ...(selection && { comparison: previousWindow ? { previousWindow, ...comparison } : null }),
        totalHours: Number(row.totalHours),
        totalOrders: Number(row.totalOrders),
      };
    },
    async details(userId, periodValue, platformValue, modeValue, calendarQuery = {}) {
      const { period, from, to, selection } = resolveAnalyticsWindow({ ...calendarQuery, period: periodValue }, clock());
      const platform = validateAnalyticsPlatform(platformValue);
      const eventPlatform = validateAnalyticsPlatform(calendarQuery.eventPlatform, 'eventPlatform');
      const { mode, deductionRate } = await earningsSettings(userId, modeValue);
      const { rankingWeekdays = [], hourlyShifts = [], ...result } = await analytics.details(userId, from, to, platform, deductionRate, ...(selection ? [selection] : []));
      const hourly = aggregateHourlyActivity(hourlyShifts, selection?.asOf ?? to, eventPlatform);
      const hourlyActivity = finishHourlyActivity(hourly, await analytics.hourlyGroups(hourly.groups, eventPlatform));
      return {
        period, platform, mode, deductionRate: mode === 'estimated_net' ? deductionRate : null, timeZone: 'Europe/Warsaw',
        from: from?.toISOString() ?? null, to: to.toISOString(),
        ...(selection && { selection }),
        ...result,
        bestWeekdays: bestWeekdays(rankingWeekdays),
        hourlyActivity,
        weekdays: [1, 2, 3, 4, 5, 6, 7].map((key) =>
          result.weekdays.find((row) => row.key === String(key)) ?? emptyGroup(String(key), platform)),
        startTimes: [0, 1, 2, 3].map((key) =>
          result.startTimes.find((row) => row.key === String(key)) ?? emptyGroup(String(key), platform)),
      };
    },
  };
}
