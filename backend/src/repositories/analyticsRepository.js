export function createAnalyticsRepository(pool) {
  return {
    async details(userId, from, to, platform, deductionRate = '0', selection = null) {
      const { rows: [row] } = await pool.query(`
        WITH period_shifts AS (
          SELECT s.id, s.started_at AT TIME ZONE 'Europe/Warsaw' AS local_start,
            EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 3600 AS hours
          FROM shifts s
          WHERE s.user_id = $1 AND s.status = 'completed'
            AND ($2::timestamptz IS NULL OR s.started_at >= $2) AND s.started_at <= $3
            AND ($6::timestamptz IS NULL OR s.started_at < $6)
            AND ($7::timestamptz IS NULL OR s.ended_at <= $7)
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
      `, [userId, from, to, platform, deductionRate, selection?.endExclusive ?? null, selection?.asOf ?? null]);
      return row;
    },
    async summary(userId, from, to, deductionRate = '0', selection = null, previousWindow = null) {
      // The current selection decides whether this is a partial comparison, even
      // when the shorter previous month was saturated to its full calendar end.
      const previousEndedCutoff = selection?.isPartial ? previousWindow?.observationCutoff : selection?.asOf;
      const { rows: [row] } = await pool.query(`
        WITH windows AS (
          SELECT 'current' AS key, $2::timestamptz AS start, $3::timestamptz AS cutoff,
            $5::timestamptz AS end_exclusive, $6::timestamptz AS ended_cutoff
          UNION ALL
          SELECT 'previous', $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::timestamptz
          WHERE $7::timestamptz IS NOT NULL
        ), shift_totals AS (
          SELECT w.key, s.distance_km, EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 3600 AS hours,
            entries.earnings * (1 - $4::numeric) AS earnings, entries.orders
          FROM windows w JOIN shifts s ON s.user_id = $1 AND s.status = 'completed'
            AND (w.start IS NULL OR s.started_at >= w.start) AND s.started_at <= w.cutoff
            AND (w.end_exclusive IS NULL OR s.started_at < w.end_exclusive)
            AND (w.ended_cutoff IS NULL OR s.ended_at <= w.ended_cutoff)
          LEFT JOIN (
            SELECT e.shift_id, SUM(e.earnings_gross) AS earnings, SUM(e.orders_count) AS orders
            FROM shift_platform_entries e GROUP BY e.shift_id
          ) entries ON entries.shift_id = s.id
        ), totals AS (
          SELECT w.key, COUNT(*) FILTER (WHERE earnings IS NOT NULL)::integer AS shift_count,
            COUNT(*) FILTER (WHERE s.key IS NOT NULL AND earnings IS NULL)::integer AS incomplete_shift_count,
            COUNT(*) FILTER (WHERE earnings IS NOT NULL AND distance_km IS NOT NULL)::integer AS distance_shift_count,
            COALESCE(SUM(earnings), 0) AS earnings,
            COALESCE(SUM(orders), 0) AS orders,
            COALESCE(SUM(hours) FILTER (WHERE earnings IS NOT NULL), 0) AS hours,
            COALESCE(SUM(distance_km) FILTER (WHERE earnings IS NOT NULL), 0) AS distance,
            COALESCE(SUM(earnings) FILTER (WHERE distance_km IS NOT NULL), 0) AS distance_earnings
          FROM windows w LEFT JOIN shift_totals s ON s.key = w.key GROUP BY w.key
        ), metric_values AS (
          -- Keep unrounded NUMERIC values until the final percentage. The distance
          -- numerator and denominator come from the same existing subset.
          SELECT t.key AS window_key, m.* FROM totals t CROSS JOIN LATERAL (VALUES
            ('totalEarnings', earnings, shift_count, 2),
            ('totalHours', hours, shift_count, NULL::integer),
            ('totalOrders', orders, shift_count, 0),
            ('earningsPerHour', earnings / NULLIF(hours, 0), shift_count, 2),
            ('earningsPerKm', distance_earnings / NULLIF(distance, 0), distance_shift_count, 2),
            ('ordersPerHour', orders / NULLIF(hours, 0), shift_count, 2)
          ) m(metric, value, observations, decimals)
        ), comparison_values AS (
          SELECT c.metric, p.value AS previous_value, p.decimals,
            CASE
              WHEN c.observations = 0 THEN 'no_current_observations'
              WHEN p.observations = 0 THEN 'no_previous_observations'
              WHEN c.value IS NULL OR p.value IS NULL THEN 'undefined_metric'
              WHEN p.value = 0 THEN 'previous_zero'
            END AS reason,
            CASE WHEN c.observations > 0 AND p.observations > 0 AND p.value > 0
              THEN ROUND((c.value - p.value) / p.value * 100, 1)::text END AS change_percent
          FROM metric_values c JOIN metric_values p ON p.metric = c.metric AND p.window_key = 'previous'
          WHERE c.window_key = 'current'
        ), expense_totals AS (
          SELECT COUNT(*)::integer AS count, COALESCE(SUM(amount), 0) AS amount FROM expenses
          WHERE user_id = $1
            AND ($2::timestamptz IS NULL OR expense_date >= ($2 AT TIME ZONE 'Europe/Warsaw')::date)
            AND expense_date <= ($3::timestamptz AT TIME ZONE 'Europe/Warsaw')::date
            AND ($5::timestamptz IS NULL OR expense_date < ($5 AT TIME ZONE 'Europe/Warsaw')::date)
        )
        SELECT shift_count AS "shiftCount", incomplete_shift_count AS "incompleteShiftCount",
          expense_totals.count AS "expenseCount", ROUND(expense_totals.amount, 2)::text AS "totalExpenses",
          distance_shift_count AS "distanceShiftCount",
          ROUND(earnings, 2)::text AS "totalEarnings", orders::text AS "totalOrders",
          hours::text AS "totalHours", ROUND(distance, 2)::text AS "totalDistance",
          ROUND(earnings / NULLIF(shift_count, 0), 2)::text AS "earningsPerShift",
          ROUND(earnings / NULLIF(hours, 0), 2)::text AS "earningsPerHour",
          ROUND(distance_earnings / NULLIF(distance, 0), 2)::text AS "earningsPerKm",
          ROUND(orders / NULLIF(hours, 0), 2)::text AS "ordersPerHour",
          ROUND(earnings / NULLIF(orders, 0), 2)::text AS "earningsPerOrder",
          (SELECT JSONB_BUILD_OBJECT(
            'previousShiftCount', p.shift_count, 'previousDistanceShiftCount', p.distance_shift_count,
            'metrics', (SELECT JSONB_OBJECT_AGG(metric, JSONB_BUILD_OBJECT(
              'previousValue', CASE WHEN metric = 'totalOrders' THEN TO_JSONB(previous_value::bigint)
                WHEN decimals IS NULL THEN TO_JSONB(previous_value)
                ELSE TO_JSONB(ROUND(previous_value, decimals)::text) END,
              'changePercent', change_percent, 'reason', reason)) FROM comparison_values)
          ) FROM totals p WHERE p.key = 'previous') AS comparison
        FROM totals CROSS JOIN expense_totals WHERE totals.key = 'current'
      `, [userId, from, to, deductionRate, selection?.endExclusive ?? null,
        selection?.asOf ?? null, previousWindow?.start ?? null,
        previousWindow?.observationCutoff ?? null, previousWindow?.endExclusive ?? null,
        previousEndedCutoff ?? null]);
      return row;
    },
  };
}
