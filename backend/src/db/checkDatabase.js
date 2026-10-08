import { randomUUID } from 'node:crypto';

export async function checkDatabase(pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows: [user] } = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [`database-check-${randomUUID()}@example.invalid`, 'test-only-hash-no-login'],
    );
    const { rows: [shift] } = await client.query(`
      INSERT INTO shifts (user_id, status, started_at, ended_at)
      VALUES ($1, 'completed', '2026-10-01T16:00:00Z', '2026-10-01T22:00:00Z')
      RETURNING id
    `, [user.id]);
    await client.query(`
      INSERT INTO shift_platform_entries (shift_id, platform, earnings_gross, orders_count)
      VALUES ($1, 'glovo', 160, 10), ($1, 'bolt_food', 75, 4)
    `, [shift.id]);
    await client.query(`
      INSERT INTO expenses (user_id, shift_id, category, amount, expense_date)
      VALUES ($1, $2, 'fuel', 20, '2026-10-01')
    `, [user.id, shift.id]);
    await client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [user.id]);

    const { rows: [result] } = await client.query(`
      SELECT s.distance_km, s.distance_source,
        SUM(e.earnings_gross) AS earnings_gross, SUM(e.orders_count)::integer AS orders_count
      FROM shifts s JOIN shift_platform_entries e ON e.shift_id = s.id
      WHERE s.id = $1 AND s.user_id = $2
      GROUP BY s.id
    `, [shift.id, user.id]);
    const savedUser = await client.query('SELECT email FROM users WHERE id = $1', [user.id]);
    const savedExpense = await client.query('SELECT amount FROM expenses WHERE shift_id = $1', [shift.id]);
    const savedSettings = await client.query('SELECT user_id FROM user_settings WHERE user_id = $1', [user.id]);

    if (result.earnings_gross !== '235.00' || result.orders_count !== 14
        || result.distance_km !== null || result.distance_source !== null
        || savedUser.rows.length !== 1 || savedExpense.rows[0]?.amount !== '20.00'
        || savedSettings.rows.length !== 1) {
      throw new Error('The database check returned unexpected data.');
    }

    return { earningsGross: result.earnings_gross, ordersCount: result.orders_count };
  } finally {
    // Diagnostic records must never become permanent application data.
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}
