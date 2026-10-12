import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { createDatabasePool } from '../src/config/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { createAnalyticsRepository } from '../src/repositories/analyticsRepository.js';
import { createAnalyticsService } from '../src/services/analyticsService.js';

const schema = `analytics_test_${randomUUID().replaceAll('-', '')}`;
const secret = randomBytes(32).toString('hex');
const day = 86400000;
const anchor = Date.now() - 3600000;
let adminPool;
let pool;
let schemaCreated = false;
let server;
let baseUrl;
let owner;
let other;
let token;
let otherToken;

before(async () => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated PostgreSQL test database.');
  adminPool = createDatabasePool(process.env.TEST_DATABASE_URL);
  await adminPool.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  pool = createDatabasePool(url.toString());
  await runMigrations(pool);
  const { rows } = await pool.query(`INSERT INTO users (email, password_hash)
    VALUES ('first@example.com', 'test-only'), ('second@example.com', 'test-only') RETURNING id`);
  [owner, other] = rows.map((row) => row.id);
  token = jwt.sign({}, secret, { subject: String(owner), expiresIn: '1h' });
  otherToken = jwt.sign({}, secret, { subject: String(other), expiresIn: '1h' });
  server = createApp(pool, secret).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

beforeEach(async () => { await pool.query('DELETE FROM shifts'); });

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (pool) await pool.end();
  if (adminPool) {
    try {
      if (schemaCreated) await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally { await adminPool.end(); }
  }
});

async function request(path = '/analytics/summary', { auth = token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(auth && { Authorization: `Bearer ${auth}` }), ...(body && { 'Content-Type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  return { status: response.status, cache: response.headers.get('Cache-Control'),
    body: response.status === 204 ? null : await response.json() };
}

async function seed({ userId = owner, startedAt = new Date(anchor - day), hours = 2,
  distance = null, entries = [['glovo', '100.00', 5]], status = 'completed' } = {}) {
  const { rows: [shift] } = await pool.query(`INSERT INTO shifts
    (user_id, status, started_at, ended_at, distance_km, distance_source)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [userId, status, startedAt,
    status === 'completed' ? new Date(startedAt.getTime() + hours * 3600000) : null,
    distance, distance === null ? null : 'manual']);
  for (const [platform, earnings, orders] of entries) {
    await pool.query(`INSERT INTO shift_platform_entries (shift_id, platform, earnings_gross, orders_count)
      VALUES ($1, $2, $3, $4)`, [shift.id, platform, earnings, orders]);
  }
  return shift.id;
}

test('empty summary has zero totals and null ratios; auth and ownership are enforced', async () => {
  const result = await request();
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'no-store');
  const summary = result.body.summary;
  for (const field of ['shiftCount', 'incompleteShiftCount', 'distanceShiftCount', 'totalHours', 'totalOrders']) {
    assert.equal(summary[field], 0);
  }
  assert.equal(summary.totalEarnings, '0.00');
  assert.equal(summary.totalDistance, '0.00');
  for (const field of ['earningsPerShift', 'earningsPerHour', 'earningsPerKm', 'ordersPerHour', 'earningsPerOrder']) {
    assert.equal(summary[field], null);
  }
  for (const auth of [null, 'invalid']) assert.equal((await request(undefined, { auth })).status, 401);
  await seed({ userId: other });
  assert.equal((await request(`/analytics/summary?user_id=${other}`)).body.summary.shiftCount, 0);
  assert.equal((await request(`/analytics/summary?user_id=${owner}`, { auth: otherToken })).body.summary.totalEarnings, '100.00');
});

test('multi-platform shifts are counted once and distance ratios use matching earnings and distance', async () => {
  await seed({ hours: 6, distance: '60.00', entries: [['glovo', '160.00', 8], ['bolt_food', '80.00', 4]] });
  await seed({ hours: 2, entries: [['glovo', '160.00', 8]] });
  const { summary } = (await request()).body;
  assert.equal(summary.shiftCount, 2);
  assert.equal(summary.totalHours, 8);
  assert.equal(summary.totalEarnings, '400.00');
  assert.equal(summary.totalOrders, 20);
  assert.equal(summary.totalDistance, '60.00');
  assert.equal(summary.distanceShiftCount, 1);
  assert.equal(summary.earningsPerShift, '200.00');
  assert.equal(summary.earningsPerHour, '50.00');
  assert.equal(summary.ordersPerHour, '2.50');
  assert.equal(summary.earningsPerOrder, '20.00');
  assert.equal(summary.earningsPerKm, '4.00');
  await seed({ distance: '0', entries: [['other', '100.00', 0]] });
  const next = (await request()).body.summary;
  assert.equal(next.distanceShiftCount, 2);
  assert.equal(next.totalDistance, '60.00');
  assert.equal(next.earningsPerKm, '5.67');
});

test('active and incomplete shifts do not invent zero earnings; actual zeros remain valid', async () => {
  await seed({ entries: [], hours: 20, distance: '999' });
  await seed({ status: 'active' });
  await seed({ distance: '0', entries: [['glovo', '0.10', 0], ['bolt_food', '0.20', 0]] });
  let summary = (await request()).body.summary;
  assert.equal(summary.shiftCount, 1);
  assert.equal(summary.incompleteShiftCount, 1);
  assert.equal(summary.totalHours, 2);
  assert.equal(summary.totalEarnings, '0.30');
  assert.equal(summary.earningsPerKm, null);
  assert.equal(summary.earningsPerOrder, null);
  assert.equal(summary.ordersPerHour, '0.00');
  await pool.query('UPDATE shift_platform_entries SET earnings_gross = 0');
  summary = (await request()).body.summary;
  assert.equal(summary.earningsPerHour, '0.00');
  assert.equal(summary.earningsPerShift, '0.00');
});

test('all four periods filter by start time and reject invalid or repeated period values', async () => {
  for (const days of [1, 10, 40, 100]) await seed({ startedAt: new Date(anchor - days * day) });
  await seed({ startedAt: new Date(Date.now() + day) });
  for (const [period, count] of [['week', 1], ['month', 2], ['three_months', 3], ['all', 4]]) {
    const result = await request(`/analytics/summary?period=${period}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.summary.period, period);
    assert.equal(result.body.summary.shiftCount, count);
    assert.equal(result.body.summary.totalEarnings, `${count * 100}.00`);
  }
  for (const query of ['period=year', 'period=', 'period=week&period=month']) {
    assert.equal((await request(`/analytics/summary?${query}`)).status, 400);
  }
  const now = new Date('2026-10-12T12:00:00.000Z');
  await pool.query('DELETE FROM shifts');
  for (const offset of [-7 * day - 1, -7 * day, -1, 0, 1]) {
    await seed({ startedAt: new Date(now.getTime() + offset) });
  }
  const service = createAnalyticsService(createAnalyticsRepository(pool), () => now);
  assert.equal((await service.summary(owner, 'week')).shiftCount, 3);
});

test('summary recalculates after editing entries, time, distance and period, and after deleting a shift', async () => {
  const id = await seed({ entries: [['glovo', '200.00', 10], ['bolt_food', '100.00', 5]] });
  assert.equal((await request()).body.summary.totalEarnings, '300.00');
  const body = { startedAt: new Date(anchor - 20 * day).toISOString(),
    endedAt: new Date(anchor - 20 * day + 3600000).toISOString(), distanceKm: '20.00',
    platformEntries: [{ platform: 'uber_eats', earningsGross: '100.00', ordersCount: 4 }] };
  assert.equal((await request(`/shifts/${id}`, { method: 'PUT', body })).status, 200);
  const summary = (await request()).body.summary;
  assert.equal(summary.totalEarnings, '100.00');
  assert.equal(summary.totalOrders, 4);
  assert.equal(summary.totalHours, 1);
  assert.equal(summary.earningsPerKm, '5.00');
  assert.equal((await request('/analytics/summary?period=week')).body.summary.shiftCount, 0);
  assert.equal((await request(`/shifts/${id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await request()).body.summary.shiftCount, 0);
});
