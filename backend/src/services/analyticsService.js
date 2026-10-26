import { validateSummaryPeriod, validateAnalyticsPlatform, validateEarningsMode } from '../validators/analyticsValidator.js';
import { httpError } from '../utils/httpError.js';

function periodBounds(value, to) {
  const period = validateSummaryPeriod(value);
  if (period === 'current_week') {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(to);
    const monday = new Date(`${date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    // Monday has no DST transition in Warsaw. Convert its local midnight to UTC.
    const offsetHours = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw',
      hour: '2-digit', hourCycle: 'h23' }).format(monday));
    monday.setUTCHours(-offsetHours);
    return { period, from: monday, to };
  }
  const days = { week: 7, month: 30, three_months: 90 }[period];
  return { period, from: days ? new Date(to.getTime() - days * 86400000) : null, to };
}

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
    async summary(userId, value, modeValue) {
      const { period, from, to } = periodBounds(value, clock());
      const { mode, deductionRate } = await earningsSettings(userId, modeValue);
      const row = await analytics.summary(userId, from, to, deductionRate);
      return {
        period, mode, deductionRate: mode === 'estimated_net' ? deductionRate : null,
        from: from?.toISOString() ?? null,
        to: to.toISOString(),
        ...row,
        totalHours: Number(row.totalHours),
        totalOrders: Number(row.totalOrders),
      };
    },
    async details(userId, periodValue, platformValue, modeValue) {
      const { period, from, to } = periodBounds(periodValue, clock());
      const platform = validateAnalyticsPlatform(platformValue);
      const { mode, deductionRate } = await earningsSettings(userId, modeValue);
      const result = await analytics.details(userId, from, to, platform, deductionRate);
      return {
        period, platform, mode, deductionRate: mode === 'estimated_net' ? deductionRate : null, timeZone: 'Europe/Warsaw',
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
