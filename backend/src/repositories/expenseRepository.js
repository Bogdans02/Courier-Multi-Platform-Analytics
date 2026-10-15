const fields = `id, shift_id AS "shiftId", category, amount::text,
  TO_CHAR(expense_date, 'YYYY-MM-DD') AS "expenseDate", note`;

export function createExpenseRepository(pool) {
  return {
    async ownsShift(userId, shiftId) {
      const { rowCount } = await pool.query('SELECT id FROM shifts WHERE user_id = $1 AND id = $2', [userId, shiftId]);
      return rowCount > 0;
    },
    async list(userId, { from, to, category }) {
      const { rows } = await pool.query(`SELECT ${fields} FROM expenses WHERE user_id = $1
        AND ($2::date IS NULL OR expense_date >= $2) AND ($3::date IS NULL OR expense_date <= $3)
        AND ($4::text IS NULL OR category = $4) ORDER BY expense_date DESC, id DESC`, [userId, from, to, category]);
      return rows;
    },
    async findById(userId, id) {
      const { rows } = await pool.query(`SELECT ${fields} FROM expenses WHERE user_id = $1 AND id = $2`, [userId, id]);
      return rows[0];
    },
    async create(userId, { shiftId, category, amount, expenseDate, note }) {
      const { rows } = await pool.query(`INSERT INTO expenses (user_id, shift_id, category, amount, expense_date, note)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${fields}`, [userId, shiftId, category, amount, expenseDate, note]);
      return rows[0];
    },
    async update(userId, id, { shiftId, category, amount, expenseDate, note }) {
      const { rows } = await pool.query(`UPDATE expenses SET shift_id = $3, category = $4, amount = $5,
        expense_date = $6, note = $7, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND id = $2 RETURNING ${fields}`, [userId, id, shiftId, category, amount, expenseDate, note]);
      return rows[0];
    },
    async remove(userId, id) {
      const { rowCount } = await pool.query('DELETE FROM expenses WHERE user_id = $1 AND id = $2', [userId, id]);
      return rowCount > 0;
    },
  };
}
