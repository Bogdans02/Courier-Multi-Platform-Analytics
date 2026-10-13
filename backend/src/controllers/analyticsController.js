export function createAnalyticsController(analytics) {
  return {
    async summary(req, res) {
      res.json({ summary: await analytics.summary(req.user.id, req.query.period) });
    },
    async details(req, res) {
      res.json({ details: await analytics.details(req.user.id, req.query.period, req.query.platform) });
    },
  };
}
