export function createShiftController(shifts) {
  return {
    async start(req, res) {
      res.status(201).json({ shift: await shifts.start(req.user.id) });
    },
    async active(req, res) {
      res.json({ shift: await shifts.active(req.user.id) });
    },
    async list(req, res) {
      res.json({ shifts: await shifts.list(req.user.id) });
    },
    async details(req, res) {
      res.json({ shift: await shifts.details(req.user.id, req.params.id) });
    },
    async finish(req, res) {
      res.json({ shift: await shifts.finish(req.user.id, req.params.id) });
    },
    async update(req, res) {
      res.json({ shift: await shifts.update(req.user.id, req.params.id, req.body) });
    },
    async remove(req, res) {
      await shifts.remove(req.user.id, req.params.id);
      res.status(204).end();
    },
  };
}
