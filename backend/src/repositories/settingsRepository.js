const fields = 'net_profile AS "netProfile", deduction_rate AS "deductionRate", ppk_opt_out AS "ppkOptOut"';

export function createSettingsRepository(pool) {
  return {
    async get(userId) {
      const { rows } = await pool.query(`SELECT ${fields} FROM user_settings WHERE user_id = $1`, [userId]);
      return rows[0] ?? { netProfile: null, deductionRate: null, ppkOptOut: null };
    },
    async save(userId, { netProfile, deductionRate, ppkOptOut }) {
      const { rows } = await pool.query(`
        INSERT INTO user_settings (user_id, net_profile, deduction_rate, ppk_opt_out)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE SET net_profile = EXCLUDED.net_profile,
          deduction_rate = EXCLUDED.deduction_rate, ppk_opt_out = EXCLUDED.ppk_opt_out,
          updated_at = CURRENT_TIMESTAMP
        RETURNING ${fields}
      `, [userId, netProfile, deductionRate, ppkOptOut]);
      return rows[0];
    },
  };
}
