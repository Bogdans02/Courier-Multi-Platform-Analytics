import { validateAnalyticsPlatform, validateEarningsMode } from '../validators/analyticsValidator.js';
import { httpError } from '../utils/httpError.js';
import { resolveAnalyticsWindow, resolvePreviousWindow } from './analyticsWindow.js';

function emptyGroup(key) {
  return { key, shiftCount: 0, totalEarnings: '0.00', totalOrders: 0,
    earningsPerOrder: null, earningsPerHour: null };
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
      const { comparison, ...values } = row;
      return {
        period, mode, deductionRate: mode === 'estimated_net' ? deductionRate : null,
        from: from?.toISOString() ?? null,
        to: to.toISOString(),
        ...(selection && { selection }),
        ...values,
        ...(selection && { comparison: previousWindow ? { previousWindow, ...comparison } : null }),
        totalHours: Number(row.totalHours),
        totalOrders: Number(row.totalOrders),
      };
    },
    async details(userId, periodValue, platformValue, modeValue, calendarQuery = {}) {
      const { period, from, to, selection } = resolveAnalyticsWindow({ ...calendarQuery, period: periodValue }, clock());
      const platform = validateAnalyticsPlatform(platformValue);
      const { mode, deductionRate } = await earningsSettings(userId, modeValue);
      const result = await analytics.details(userId, from, to, platform, deductionRate, ...(selection ? [selection] : []));
      return {
        period, platform, mode, deductionRate: mode === 'estimated_net' ? deductionRate : null, timeZone: 'Europe/Warsaw',
        from: from?.toISOString() ?? null, to: to.toISOString(),
        ...(selection && { selection }),
        ...result,
        weekdays: [1, 2, 3, 4, 5, 6, 7].map((key) =>
          result.weekdays.find((row) => row.key === String(key)) ?? emptyGroup(String(key))),
        startTimes: [0, 1, 2, 3].map((key) =>
          result.startTimes.find((row) => row.key === String(key)) ?? emptyGroup(String(key))),
      };
    },
  };
}
