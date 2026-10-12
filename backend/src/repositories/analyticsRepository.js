export function createAnalyticsRepository(pool) {
  return {
    async summary(userId, from, to) {
      const { rows: [row] } = await pool.query(`
        WITH shift_totals AS (
          SELECT s.distance_km, EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 3600 AS hours,
            entries.earnings, entries.orders
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
      `, [userId, from, to]);
      return row;
    },
  };
}
