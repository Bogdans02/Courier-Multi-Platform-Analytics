const columns = 'id, status, started_at, ended_at, distance_km, distance_source';
const entryColumns = `COALESCE((
  SELECT json_agg(json_build_object('platform', e.platform, 'earningsGross', e.earnings_gross::text,
    'ordersCount', e.orders_count) ORDER BY e.id)
  FROM shift_platform_entries e WHERE e.shift_id = shifts.id
), '[]'::json) AS platform_entries`;

export function createShiftRepository(pool) {
  return {
    async start(userId) {
      const { rows } = await pool.query(
        `INSERT INTO shifts (user_id, started_at) VALUES ($1, clock_timestamp()) RETURNING ${columns}`,
        [userId],
      );
      return rows[0];
    },
    async findActive(userId) {
      const { rows } = await pool.query(
        `SELECT ${columns}, ${entryColumns} FROM shifts WHERE user_id = $1 AND status = 'active'`, [userId],
      );
      return rows[0];
    },
    async list(userId) {
      const { rows } = await pool.query(
        `SELECT ${columns}, ${entryColumns} FROM shifts WHERE user_id = $1 AND status = 'completed'
         ORDER BY started_at DESC, id DESC`, [userId],
      );
      return rows;
    },
    async findById(userId, id) {
      const { rows } = await pool.query(
        `SELECT ${columns}, ${entryColumns} FROM shifts WHERE user_id = $1 AND id = $2`, [userId, id],
      );
      return rows[0];
    },
    async finish(userId, id) {
      const { rows } = await pool.query(
        `UPDATE shifts SET status = 'completed', ended_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE user_id = $1 AND id = $2 AND status = 'active' RETURNING ${columns}`, [userId, id],
      );
      return rows[0];
    },
    async update(userId, id, { startedAt, endedAt, distanceKm, platformEntries }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: [shift] } = await client.query(
          `UPDATE shifts SET started_at = $3, ended_at = $4, distance_km = $5,
           distance_source = CASE WHEN $5::numeric IS NULL THEN NULL ELSE 'manual' END,
           updated_at = clock_timestamp()
           WHERE user_id = $1 AND id = $2 AND status = 'completed' RETURNING ${columns}`,
          [userId, id, startedAt, endedAt, distanceKm],
        );
        if (shift) {
          await client.query('DELETE FROM shift_platform_entries WHERE shift_id = $1', [id]);
          shift.platform_entries = [];
          for (const entry of platformEntries) {
            const { rows: [saved] } = await client.query(
              `INSERT INTO shift_platform_entries (shift_id, platform, earnings_gross, orders_count)
               VALUES ($1, $2, $3, $4)
               RETURNING platform, earnings_gross AS "earningsGross", orders_count AS "ordersCount"`,
              [id, entry.platform, entry.earningsGross, entry.ordersCount],
            );
            shift.platform_entries.push(saved);
          }
        }
        await client.query('COMMIT');
        return shift;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async remove(userId, id) {
      const { rowCount } = await pool.query('DELETE FROM shifts WHERE user_id = $1 AND id = $2', [userId, id]);
      return rowCount > 0;
    },
  };
}
