export function createAnalyticsRepository(pool) {
  return {
    async details(userId, from, to, platform, deductionRate = '0') {
      const { rows: [row] } = await pool.query(`
        WITH period_shifts AS (
          SELECT s.id, s.started_at AT TIME ZONE 'Europe/Warsaw' AS local_start,
            EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 3600 AS hours
          FROM shifts s
          WHERE s.user_id = $1 AND s.status = 'completed'
            AND ($2::timestamptz IS NULL OR s.started_at >= $2) AND s.started_at <= $3
        ), period_entries AS (
          SELECT e.shift_id, e.platform, e.orders_count,
            e.earnings_gross * (1 - $5::numeric) AS earnings_gross
          FROM shift_platform_entries e JOIN period_shifts s ON s.id = e.shift_id
        ), selected_shifts AS (
          -- Sum entries first, so a multi-platform shift contributes its hours only once.
          SELECT s.id, s.local_start, s.hours, SUM(e.earnings_gross) AS earnings,
            SUM(e.orders_count) AS orders
          FROM period_shifts s JOIN period_entries e ON e.shift_id = s.id
          WHERE $4 = 'all' OR e.platform = $4
          GROUP BY s.id, s.local_start, s.hours
        ), grouped AS (
          SELECT 'trend' AS kind, TO_CHAR(local_start, 'YYYY-MM-DD') AS key,
            earnings, orders, hours FROM selected_shifts
          UNION ALL
          SELECT 'months', TO_CHAR(local_start, 'YYYY-MM'), earnings, orders, hours FROM selected_shifts
          UNION ALL
          SELECT 'weekdays', EXTRACT(ISODOW FROM local_start)::integer::text,
            earnings, orders, hours FROM selected_shifts
          UNION ALL
          SELECT 'startTimes', (EXTRACT(HOUR FROM local_start)::integer / 6)::text,
            earnings, orders, hours FROM selected_shifts
        ), group_totals AS (
          SELECT kind, key, COUNT(*)::integer AS count, SUM(earnings) AS earnings,
            SUM(orders) AS orders, SUM(hours) AS hours
          FROM grouped GROUP BY kind, key
        ), group_results AS (
          SELECT kind, key, JSONB_BUILD_OBJECT(
            'key', key, 'shiftCount', count, 'totalEarnings', ROUND(earnings, 2)::text,
            'totalOrders', orders, 'earningsPerOrder', ROUND(earnings / NULLIF(orders, 0), 2)::text,
            'earningsPerHour', CASE WHEN $4 = 'all' THEN ROUND(earnings / NULLIF(hours, 0), 2)::text END
          ) AS value FROM group_totals
        ), platform_totals AS (
          -- Platform comparison always uses all entries in the selected period.
          SELECT platform, COUNT(*)::integer AS count, SUM(earnings_gross) AS earnings,
            SUM(orders_count) AS orders FROM period_entries GROUP BY platform
        ), platform_results AS (
          SELECT platform, JSONB_BUILD_OBJECT(
            'platform', platform, 'shiftCount', count, 'totalEarnings', ROUND(earnings, 2)::text,
            'totalOrders', orders, 'earningsPerOrder', ROUND(earnings / NULLIF(orders, 0), 2)::text,
            'earningsShare', ROUND(100 * earnings / NULLIF(SUM(earnings) OVER (), 0), 2)::text,
            'ordersShare', ROUND(100 * orders / NULLIF(SUM(orders) OVER (), 0), 2)::text
          ) AS value FROM platform_totals
        )
        SELECT (SELECT COUNT(*)::integer FROM selected_shifts) AS "shiftCount",
          (SELECT COUNT(*)::integer FROM period_shifts s WHERE NOT EXISTS
            (SELECT 1 FROM period_entries e WHERE e.shift_id = s.id)) AS "incompleteShiftCount",
          COALESCE((SELECT JSONB_AGG(value ORDER BY key) FROM group_results WHERE kind = 'trend'), '[]') AS trend,
          COALESCE((SELECT JSONB_AGG(value ORDER BY key) FROM group_results WHERE kind = 'months'), '[]') AS months,
          COALESCE((SELECT JSONB_AGG(value ORDER BY key) FROM group_results WHERE kind = 'weekdays'), '[]') AS weekdays,
          COALESCE((SELECT JSONB_AGG(value ORDER BY key) FROM group_results WHERE kind = 'startTimes'), '[]') AS "startTimes",
          COALESCE((SELECT JSONB_AGG(value ORDER BY platform) FROM platform_results), '[]') AS platforms
      `, [userId, from, to, platform, deductionRate]);
      return row;
    },
    async summary(userId, from, to, deductionRate = '0') {
      const { rows: [row] } = await pool.query(`
        WITH shift_totals AS (
          SELECT s.distance_km, EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 3600 AS hours,
            entries.earnings * (1 - $4::numeric) AS earnings, entries.orders
          FROM shifts s
          LEFT JOIN (
            SELECT e.shift_id, SUM(e.earnings_gross) AS earnings, SUM(e.orders_count) AS orders
            FROM shift_platform_entries e GROUP BY e.shift_id
          ) entries ON entries.shift_id = s.id
          WHERE s.user_id = $1 AND s.status = 'completed'
            AND ($2::timestamptz IS NULL OR s.started_at >= $2)
            AND s.started_at <= $3
        ), totals AS (
          SELECT COUNT(*) FILTER (WHERE earnings IS NOT NULL)::integer AS shift_count,
            COUNT(*) FILTER (WHERE earnings IS NULL)::integer AS incomplete_shift_count,
            COUNT(*) FILTER (WHERE earnings IS NOT NULL AND distance_km IS NOT NULL)::integer AS distance_shift_count,
            COALESCE(SUM(earnings), 0) AS earnings,
            COALESCE(SUM(orders), 0) AS orders,
            COALESCE(SUM(hours) FILTER (WHERE earnings IS NOT NULL), 0) AS hours,
            COALESCE(SUM(distance_km) FILTER (WHERE earnings IS NOT NULL), 0) AS distance,
            COALESCE(SUM(earnings) FILTER (WHERE distance_km IS NOT NULL), 0) AS distance_earnings
          FROM shift_totals
        )
        SELECT shift_count AS "shiftCount", incomplete_shift_count AS "incompleteShiftCount",
          distance_shift_count AS "distanceShiftCount",
          ROUND(earnings, 2)::text AS "totalEarnings", orders::text AS "totalOrders",
          hours::text AS "totalHours", ROUND(distance, 2)::text AS "totalDistance",
          ROUND(earnings / NULLIF(shift_count, 0), 2)::text AS "earningsPerShift",
          ROUND(earnings / NULLIF(hours, 0), 2)::text AS "earningsPerHour",
          ROUND(distance_earnings / NULLIF(distance, 0), 2)::text AS "earningsPerKm",
          ROUND(orders / NULLIF(hours, 0), 2)::text AS "ordersPerHour",
          ROUND(earnings / NULLIF(orders, 0), 2)::text AS "earningsPerOrder"
        FROM totals
      `, [userId, from, to, deductionRate]);
      return row;
    },
  };
}
