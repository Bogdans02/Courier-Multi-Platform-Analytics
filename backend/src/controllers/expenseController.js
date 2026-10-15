export function createExpenseController(expenses) {
  return {
    async list(req, res) { res.json({ expenses: await expenses.list(req.user.id, req.query) }); },
    async create(req, res) { res.status(201).json({ expense: await expenses.create(req.user.id, req.body) }); },
    async update(req, res) { res.json({ expense: await expenses.update(req.user.id, req.params.id, req.body) }); },
    async remove(req, res) { await expenses.remove(req.user.id, req.params.id); res.status(204).end(); },
  };
}
