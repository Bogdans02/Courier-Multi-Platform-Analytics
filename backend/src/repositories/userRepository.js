export function createUserRepository(pool) {
  return {
    async create(email, passwordHash) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: [user] } = await client.query(
          'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
          [email, passwordHash],
        );
        await client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [user.id]);
        await client.query('COMMIT');
        return user;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async findByEmail(email) {
      const { rows } = await pool.query(
        'SELECT id, email, password_hash FROM users WHERE lower(email) = $1', [email],
      );
      return rows[0];
    },
    async findById(id) {
      const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [id]);
      return rows[0];
    },
  };
}
