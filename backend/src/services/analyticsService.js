import { validateSummaryPeriod } from '../validators/analyticsValidator.js';

export function createAnalyticsService(analytics, clock = () => new Date()) {
  return {
    async summary(userId, value) {
      const period = validateSummaryPeriod(value);
      const to = clock();
      const days = { week: 7, month: 30, three_months: 90 }[period];
      const from = days ? new Date(to.getTime() - days * 86400000) : null;
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
  };
}
