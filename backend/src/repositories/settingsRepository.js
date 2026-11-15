const fields = 'net_profile AS "netProfile", deduction_rate AS "deductionRate", ppk_opt_out AS "ppkOptOut", '
  + 'transport_type AS "transportType", fuel_per_100km AS "fuelPer100km", fuel_price_per_l AS "fuelPricePerL"';
const empty = { netProfile: null, deductionRate: null, ppkOptOut: null,
  transportType: null, fuelPer100km: null, fuelPricePerL: null };

export function createSettingsRepository(pool) {
  return {
    async get(userId) {
      const { rows } = await pool.query(`SELECT ${fields} FROM user_settings WHERE user_id = $1`, [userId]);
      return rows[0] ?? { ...empty };
    },
    async save(userId, { netProfile, deductionRate, ppkOptOut, transportType, fuelPer100km, fuelPricePerL }) {
      const { rows } = await pool.query(`
        INSERT INTO user_settings (user_id, net_profile, deduction_rate, ppk_opt_out,
          transport_type, fuel_per_100km, fuel_price_per_l)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE SET net_profile = EXCLUDED.net_profile,
          deduction_rate = EXCLUDED.deduction_rate, ppk_opt_out = EXCLUDED.ppk_opt_out,
          transport_type = EXCLUDED.transport_type, fuel_per_100km = EXCLUDED.fuel_per_100km,
          fuel_price_per_l = EXCLUDED.fuel_price_per_l, updated_at = CURRENT_TIMESTAMP
        RETURNING ${fields}
      `, [userId, netProfile, deductionRate, ppkOptOut, transportType, fuelPer100km, fuelPricePerL]);
      return rows[0];
    },
  };
}
