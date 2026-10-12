export function createAnalyticsController(analytics) {
  return {
    async summary(req, res) {
      res.json({ summary: await analytics.summary(req.user.id, req.query.period) });
    },
  };
}
