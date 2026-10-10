export function createAuthController(auth) {
  return {
    async register(req, res) {
      res.status(201).json({ user: await auth.register(req.body) });
    },
    async login(req, res) {
      res.json(await auth.login(req.body));
    },
    me(req, res) {
      res.json({ user: req.user });
    },
  };
}
