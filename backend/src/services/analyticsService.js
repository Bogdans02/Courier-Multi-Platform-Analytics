import { validateSummaryPeriod, validateAnalyticsPlatform } from '../validators/analyticsValidator.js';

function periodBounds(value, to) {
  const period = validateSummaryPeriod(value);
  const days = { week: 7, month: 30, three_months: 90 }[period];
  return { period, from: days ? new Date(to.getTime() - days * 86400000) : null, to };
}

function emptyGroup(key) {
  return { key, shiftCount: 0, totalEarnings: '0.00', totalOrders: 0,
    earningsPerOrder: null, earningsPerHour: null };
}

export function createAnalyticsService(analytics, clock = () => new Date()) {
  return {
    async summary(userId, value) {
      const { period, from, to } = periodBounds(value, clock());
      const row = await analytics.summary(userId, from, to);
      return {
        period,
        from: from?.toISOString() ?? null,
        to: to.toISOString(),
        ...row,
        totalHours: Number(row.totalHours),
        totalOrders: Number(row.totalOrders),
      };
    },
    async details(userId, periodValue, platformValue) {
      const { period, from, to } = periodBounds(periodValue, clock());
      const platform = validateAnalyticsPlatform(platformValue);
      const result = await analytics.details(userId, from, to, platform);
      return {
        period, platform, timeZone: 'Europe/Warsaw',
        from: from?.toISOString() ?? null, to: to.toISOString(),
        ...result,
        weekdays: [1, 2, 3, 4, 5, 6, 7].map((key) =>
          result.weekdays.find((row) => row.key === String(key)) ?? emptyGroup(String(key))),
        startTimes: [0, 1, 2, 3].map((key) =>
          result.startTimes.find((row) => row.key === String(key)) ?? emptyGroup(String(key))),
      };
    },
  };
}
