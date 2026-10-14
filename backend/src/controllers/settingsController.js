export function createSettingsController(settings) {
  return {
    async get(req, res) { res.json(await settings.get(req.user.id)); },
    async save(req, res) { res.json(await settings.save(req.user.id, req.body)); },
  };
}
