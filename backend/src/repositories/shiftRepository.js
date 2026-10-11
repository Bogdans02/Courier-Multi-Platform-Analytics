const columns = 'id, status, started_at, ended_at, distance_km, distance_source';

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
        `SELECT ${columns} FROM shifts WHERE user_id = $1 AND status = 'active'`, [userId],
      );
      return rows[0];
    },
    async list(userId) {
      const { rows } = await pool.query(
        `SELECT ${columns} FROM shifts WHERE user_id = $1 AND status = 'completed'
         ORDER BY started_at DESC, id DESC`, [userId],
      );
      return rows;
    },
    async findById(userId, id) {
      const { rows } = await pool.query(
        `SELECT ${columns} FROM shifts WHERE user_id = $1 AND id = $2`, [userId, id],
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
    async update(userId, id, { startedAt, endedAt, distanceKm }) {
      const { rows } = await pool.query(
        `UPDATE shifts SET started_at = $3, ended_at = $4, distance_km = $5,
         distance_source = CASE WHEN $5::numeric IS NULL THEN NULL ELSE 'manual' END,
         updated_at = clock_timestamp()
         WHERE user_id = $1 AND id = $2 AND status = 'completed' RETURNING ${columns}`,
        [userId, id, startedAt, endedAt, distanceKm],
      );
      return rows[0];
    },
    async remove(userId, id) {
      const { rowCount } = await pool.query('DELETE FROM shifts WHERE user_id = $1 AND id = $2', [userId, id]);
      return rowCount > 0;
    },
  };
}
