import { httpError } from '../utils/httpError.js';
import { validateExpense, validateExpenseId, validateExpenseFilters } from '../validators/expenseValidator.js';

export function createExpenseService(expenses) {
  async function checkedValues(userId, body) {
    const values = validateExpense(body);
    if (values.shiftId !== null && !await expenses.ownsShift(userId, values.shiftId)) {
      throw httpError(404, 'Nie znaleziono wskazanej zmiany.');
    }
    return values;
  }
  return {
    async list(userId, query) { return expenses.list(userId, validateExpenseFilters(query)); },
    async create(userId, body) { return expenses.create(userId, await checkedValues(userId, body)); },
    async update(userId, value, body) {
      const id = validateExpenseId(value);
      if (!await expenses.findById(userId, id)) throw httpError(404, 'Nie znaleziono kosztu.');
      const updated = await expenses.update(userId, id, await checkedValues(userId, body));
      if (!updated) throw httpError(404, 'Nie znaleziono kosztu.');
      return updated;
    },
    async remove(userId, value) {
      if (!await expenses.remove(userId, validateExpenseId(value))) throw httpError(404, 'Nie znaleziono kosztu.');
    },
  };
}
