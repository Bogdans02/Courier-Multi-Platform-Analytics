import { httpError } from '../utils/httpError.js';
import { validateShiftId, validateShiftUpdate } from '../validators/shiftValidator.js';

function presentShift(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at?.toISOString() ?? null,
    distanceKm: row.distance_km,
    distanceSource: row.distance_source,
    durationSeconds: row.ended_at ? (row.ended_at - row.started_at) / 1000 : null,
  };
}

export function createShiftService(shifts) {
  async function findOwned(userId, id) {
    const row = await shifts.findById(userId, id);
    if (!row) throw httpError(404, 'Nie znaleziono zmiany.');
    return row;
  }

  return {
    async start(userId) {
      try {
        return presentShift(await shifts.start(userId));
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'shifts_one_active_per_user') {
          throw httpError(409, 'Masz już aktywną zmianę. Zakończ ją przed rozpoczęciem kolejnej.');
        }
        throw error;
      }
    },
    async active(userId) {
      return presentShift(await shifts.findActive(userId));
    },
    async list(userId) {
      return (await shifts.list(userId)).map(presentShift);
    },
    async details(userId, value) {
      return presentShift(await findOwned(userId, validateShiftId(value)));
    },
    async finish(userId, value) {
      const id = validateShiftId(value);
      const row = await findOwned(userId, id);
      if (row.status !== 'active') throw httpError(409, 'Ta zmiana jest już zakończona.');
      const finished = await shifts.finish(userId, id);
      if (!finished) throw httpError(409, 'Ta zmiana jest już zakończona.');
      return presentShift(finished);
    },
    async update(userId, value, body) {
      const id = validateShiftId(value);
      const row = await findOwned(userId, id);
      if (row.status !== 'completed') throw httpError(409, 'Zakończ zmianę przed edycją jej podsumowania.');
      const updated = await shifts.update(userId, id, validateShiftUpdate(body));
      if (!updated) throw httpError(404, 'Nie znaleziono zmiany.');
      return presentShift(updated);
    },
    async remove(userId, value) {
      if (!await shifts.remove(userId, validateShiftId(value))) throw httpError(404, 'Nie znaleziono zmiany.');
    },
  };
}
