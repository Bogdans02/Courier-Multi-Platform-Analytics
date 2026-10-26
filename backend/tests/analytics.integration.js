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

beforeEach(async () => {
  await pool.query('DELETE FROM shifts');
  await pool.query('DELETE FROM user_settings');
});

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

test('settings start unconfigured, require authorization and isolate reads and writes by token owner', async () => {
  const empty = await request('/settings');
  assert.equal(empty.status, 200);
  assert.equal(empty.cache, 'no-store');
  assert.deepEqual(empty.body.settings, { netProfile: null, deductionRate: null, ppkOptOut: null });
  assert.equal(empty.body.profiles.length, 6);
  for (const method of ['GET', 'PUT']) {
    for (const auth of [null, 'invalid']) {
      assert.equal((await request('/settings', { method, auth,
        ...(method === 'PUT' && { body: { netProfile: 'student_under_26' } }),
      })).status, 401);
    }
  }
  const saved = await request(`/settings?user_id=${other}`, {
    method: 'PUT', body: { netProfile: 'unemployed_under_26', ppkOptOut: true, deductionRate: '0', user_id: other },
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.settings, { netProfile: 'unemployed_under_26', deductionRate: '0.19250', ppkOptOut: true });
  assert.deepEqual((await request(`/settings?user_id=${other}`)).body.settings, saved.body.settings);
  assert.equal((await request(`/settings?user_id=${owner}`, { auth: otherToken })).body.settings.netProfile, null);
  await request('/settings', { method: 'PUT', auth: otherToken, body: { netProfile: 'student_under_26', user_id: owner } });
  assert.deepEqual((await request('/settings')).body.settings, saved.body.settings);
});

test('settings persist all profile variants, ignore forged preset rates and reject invalid writes', async () => {
  for (const [netProfile, ppkOptOut, deductionRate] of [
    ['student_under_26', false, '0.00000'], ['employed_under_26', true, '0.09000'],
    ['unemployed_under_26', true, '0.19250'], ['unemployed_under_26', false, '0.21250'],
    ['employed_26_plus', false, '0.18720'],
    ['unemployed_26_plus', true, '0.27820'], ['unemployed_26_plus', false, '0.29820'],
    ['custom', null, '0.12345'], ['custom', null, '0.00000'], ['custom', null, '1.00000'],
  ]) {
    const saved = await request('/settings', { method: 'PUT', body: {
      netProfile, ppkOptOut, deductionRate: netProfile === 'custom' ? deductionRate : '0.55555',
    } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.settings.deductionRate, deductionRate);
    assert.equal(saved.body.settings.ppkOptOut, netProfile.startsWith('unemployed') ? ppkOptOut : null);
    assert.deepEqual((await request('/settings')).body.settings, saved.body.settings);
  }
  const previous = (await request('/settings')).body.settings;
  for (const body of [{}, { netProfile: 'unknown' }, { netProfile: 'unemployed_under_26' },
    { netProfile: 'custom', deductionRate: '1.01' }, { netProfile: 'custom', deductionRate: '0.123456' }]) {
    assert.equal((await request('/settings', { method: 'PUT', body })).status, 400);
    assert.deepEqual((await request('/settings')).body.settings, previous);
  }
});

test('net analytics require configured settings, reject invalid modes and never use another owner settings', async () => {
  await seed();
  await request('/settings', { auth: otherToken, method: 'PUT', body: { netProfile: 'student_under_26' } });
  for (const endpoint of ['summary', 'details']) {
    assert.equal((await request(`/analytics/${endpoint}?mode=estimated_net&user_id=${other}`)).status, 409);
    for (const query of ['mode=net', 'mode=', 'mode=gross&mode=estimated_net']) {
      assert.equal((await request(`/analytics/${endpoint}?${query}`)).status, 400);
    }
    for (const auth of [null, 'invalid']) {
      assert.equal((await request(`/analytics/${endpoint}?mode=estimated_net`, { auth })).status, 401);
    }
  }
  assert.equal((await request()).body.summary.totalEarnings, '100.00');
});

test('net summary recalculates money from unrounded totals and keeps matching distance samples and nonfinancial values', async () => {
  await seed({ hours: 6, distance: '60', entries: [['glovo', '160', 8], ['bolt_food', '80', 4]] });
  await seed({ hours: 2, entries: [['glovo', '160', 8]] });
  await seed({ userId: other, entries: [['glovo', '999', 100]] });
  await request('/settings', { method: 'PUT', body: { netProfile: 'employed_26_plus' } });
  const gross = (await request()).body.summary;
  const net = (await request('/analytics/summary?mode=estimated_net')).body.summary;
  assert.equal(net.mode, 'estimated_net');
  assert.equal(net.deductionRate, '0.18720');
  for (const [field, expected] of Object.entries({ totalEarnings: '325.12', earningsPerShift: '162.56',
    earningsPerHour: '40.64', earningsPerKm: '3.25', earningsPerOrder: '16.26' })) {
    assert.equal(net[field], expected);
  }
  for (const field of ['shiftCount', 'incompleteShiftCount', 'distanceShiftCount', 'totalHours',
    'totalDistance', 'totalOrders', 'ordersPerHour']) assert.equal(net[field], gross[field]);
  const next = await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '0' } });
  assert.equal(next.status, 200);
  assert.equal((await request('/analytics/summary?mode=estimated_net')).body.summary.totalEarnings, '400.00');
  assert.equal((await request()).body.summary.totalEarnings, '400.00');
  const { rows: [row] } = await pool.query(`SELECT SUM(e.earnings_gross)::text AS gross
    FROM shift_platform_entries e JOIN shifts s ON s.id = e.shift_id WHERE s.user_id = $1`, [owner]);
  assert.equal(row.gross, '400.00');
});

test('net charts recalculate every group, preserve platform restrictions and handle 100 percent and empty data', async () => {
  await request('/settings', { method: 'PUT', body: { netProfile: 'employed_26_plus' } });
  const empty = (await request('/analytics/details?mode=estimated_net')).body.details;
  assert.equal(empty.weekdays[0].earningsPerHour, null);
  assert.equal(empty.weekdays[0].totalEarnings, '0.00');
  await seed({ hours: 6, distance: '60', entries: [['glovo', '160', 8], ['bolt_food', '80', 4]] });
  await seed({ hours: 2, entries: [['glovo', '160', 8]] });
  const net = (await request('/analytics/details?mode=estimated_net')).body.details;
  for (const field of ['trend', 'months', 'weekdays', 'startTimes']) {
    const group = net[field].find((row) => row.shiftCount);
    assert.equal(group.totalEarnings, '325.12');
    assert.equal(group.earningsPerOrder, '16.26');
    assert.equal(group.earningsPerHour, '40.64');
  }
  const glovo = net.platforms.find((row) => row.platform === 'glovo');
  assert.equal(glovo.totalEarnings, '260.10');
  assert.equal(glovo.earningsShare, '80.00');
  assert.equal(glovo.ordersShare, '80.00');
  const filtered = (await request('/analytics/details?mode=estimated_net&platform=glovo')).body.details;
  assert.equal(filtered.trend[0].totalEarnings, '260.10');
  assert.equal(filtered.trend[0].earningsPerHour, null);
  assert.deepEqual(filtered.platforms, net.platforms);
  await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '1' } });
  const zero = (await request('/analytics/details?mode=estimated_net')).body.details;
  assert.equal(zero.trend[0].totalEarnings, '0.00');
  assert.equal(zero.trend[0].earningsPerHour, '0.00');
  assert.equal(zero.platforms[0].earningsShare, null);
  assert.notEqual(zero.platforms[0].ordersShare, null);
});

test('net earnings round only final aggregates and update after shift edits and deletion', async () => {
  await request('/settings', { method: 'PUT', body: { netProfile: 'unemployed_26_plus', ppkOptOut: false } });
  const id = await seed({ distance: null, entries: [['glovo', '0.01', 0], ['bolt_food', '0.01', 0]] });
  let summary = (await request('/analytics/summary?mode=estimated_net')).body.summary;
  assert.equal(summary.totalEarnings, '0.01');
  assert.equal(summary.earningsPerKm, null);
  assert.equal(summary.earningsPerOrder, null);
  assert.equal((await request('/analytics/details?mode=estimated_net')).body.details.trend[0].totalEarnings, '0.01');
  await pool.query('UPDATE shift_platform_entries SET earnings_gross = 100 WHERE shift_id = $1', [id]);
  summary = (await request('/analytics/summary?mode=estimated_net')).body.summary;
  assert.equal(summary.totalEarnings, '140.36');
  await request(`/shifts/${id}`, { method: 'DELETE' });
  summary = (await request('/analytics/summary?mode=estimated_net')).body.summary;
  assert.equal(summary.totalEarnings, '0.00');
  assert.equal(summary.earningsPerHour, null);
});

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

test('current week includes the Warsaw Monday boundary and Sunday, with exact net aggregation', async () => {
  const now = new Date('2026-10-25T15:00:00Z');
  await seed({ startedAt: new Date('2026-10-18T21:59:59Z'), entries: [['glovo', '999.00', 1]] });
  await seed({ startedAt: new Date('2026-10-18T22:00:00Z'), entries: [['glovo', '100.00', 1]] });
  await seed({ startedAt: new Date('2026-10-25T10:00:00Z'), entries: [['wolt', '50.00', 1]] });
  await seed({ startedAt: new Date('2026-10-25T16:00:00Z'), entries: [['glovo', '999.00', 1]] });
  const service = createAnalyticsService(createAnalyticsRepository(pool), () => now,
    { async get() { return { netProfile: 'custom', deductionRate: '0.20000' }; } });
  for (const [mode, amount] of [['gross', '150.00'], ['estimated_net', '120.00']]) {
    const summary = await service.summary(owner, 'current_week', mode);
    const details = await service.details(owner, 'current_week', 'all', mode);
    assert.equal(summary.shiftCount, 2);
    assert.equal(summary.totalEarnings, amount);
    assert.equal(details.shiftCount, 2);
    assert.deepEqual(details.trend.map(row => row.key), ['2026-10-19', '2026-10-25']);
  }
  assert.equal((await request('/analytics/summary?period=current_week')).status, 200);
  assert.equal((await request('/analytics/details?period=current_week')).status, 200);
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

test('details protects the endpoint, isolates accounts and returns empty groups without invented ratios', async () => {
  const result = await request('/analytics/details');
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'no-store');
  const { details } = result.body;
  assert.equal(details.shiftCount, 0);
  assert.equal(details.timeZone, 'Europe/Warsaw');
  for (const field of ['trend', 'months', 'platforms']) assert.deepEqual(details[field], []);
  assert.equal(details.weekdays.length, 7);
  assert.equal(details.startTimes.length, 4);
  assert.equal(details.weekdays[0].earningsPerOrder, null);
  for (const auth of [null, 'invalid']) assert.equal((await request('/analytics/details', { auth })).status, 401);
  await seed({ userId: other });
  assert.equal((await request(`/analytics/details?user_id=${other}`)).body.details.shiftCount, 0);
  assert.equal((await request(`/analytics/details?user_id=${owner}`, { auth: otherToken })).body.details.shiftCount, 1);
});

test('Pyszne.pl and Wolt contribute to totals and support separate analytics filters', async () => {
  await seed({ entries: [['pyszne_pl', '60.00', 3], ['wolt', '40.00', 2]] });
  const summary = (await request()).body.summary;
  assert.equal(summary.totalEarnings, '100.00');
  assert.equal(summary.totalOrders, 5);
  for (const [platform, earnings, orders, share] of [
    ['pyszne_pl', '60.00', 3, '60.00'], ['wolt', '40.00', 2, '40.00'],
  ]) {
    const response = await request(`/analytics/details?platform=${platform}`);
    assert.equal(response.status, 200);
    const details = response.body.details;
    assert.equal(details.shiftCount, 1);
    assert.equal(details.trend[0].totalEarnings, earnings);
    assert.equal(details.trend[0].totalOrders, orders);
    assert.equal(details.trend[0].earningsPerHour, null);
    assert.equal(details.platforms.length, 2);
    assert.deepEqual(details.platforms.find((row) => row.platform === platform), {
      platform, shiftCount: 1, totalEarnings: earnings, totalOrders: orders,
      earningsPerOrder: '20.00', earningsShare: share, ordersShare: share,
    });
  }
});

test('details aggregates exact money once per shift and filters only attributable platform values', async () => {
  const startedAt = new Date('2026-10-05T10:00:00Z');
  await seed({ startedAt, hours: 6, entries: [['glovo', '160.10', 8], ['bolt_food', '80.20', 4]] });
  await seed({ startedAt, hours: 2, entries: [['glovo', '160.00', 8]] });
  await seed({ startedAt, entries: [] });
  await seed({ startedAt, status: 'active', entries: [['glovo', '999.00', 99]] });
  await seed({ userId: other, startedAt });
  const all = (await request('/analytics/details')).body.details;
  assert.equal(all.shiftCount, 2);
  assert.equal(all.incompleteShiftCount, 1);
  assert.equal(all.trend.length, 1);
  assert.equal(all.trend[0].totalEarnings, '400.30');
  assert.equal(all.trend[0].totalOrders, 20);
  assert.equal(all.trend[0].earningsPerHour, '50.04');
  assert.equal(all.weekdays[0].shiftCount, 2);
  assert.equal(all.startTimes[2].totalEarnings, '400.30');
  const glovo = all.platforms.find((row) => row.platform === 'glovo');
  assert.deepEqual(glovo, { platform: 'glovo', shiftCount: 2, totalEarnings: '320.10', totalOrders: 16,
    earningsPerOrder: '20.01', earningsShare: '79.97', ordersShare: '80.00' });
  const filtered = (await request('/analytics/details?platform=bolt_food')).body.details;
  assert.equal(filtered.shiftCount, 1);
  assert.equal(filtered.trend[0].totalEarnings, '80.20');
  assert.equal(filtered.trend[0].totalOrders, 4);
  for (const field of ['trend', 'months', 'weekdays', 'startTimes']) {
    for (const row of filtered[field]) {
      assert.equal(row.earningsPerHour, null);
      assert.equal(Object.hasOwn(row, 'earningsPerKm'), false);
      assert.equal(Object.hasOwn(row, 'totalHours'), false);
    }
  }
  assert.deepEqual(filtered.platforms, all.platforms);
  const absent = (await request('/analytics/details?platform=uber_eats')).body.details;
  assert.equal(absent.shiftCount, 0);
  assert.deepEqual(absent.trend, []);
  await pool.query('UPDATE shift_platform_entries SET earnings_gross = 0, orders_count = 0');
  const zero = (await request('/analytics/details')).body.details;
  assert.equal(zero.trend[0].totalEarnings, '0.00');
  assert.equal(zero.trend[0].earningsPerHour, '0.00');
  assert.equal(zero.trend[0].earningsPerOrder, null);
  assert.ok(zero.platforms.every((row) => row.earningsShare === null && row.ordersShare === null));
});

test('Warsaw grouping handles local day and year boundaries, exact six-hour buckets and DST', async () => {
  for (const time of [
    '2025-12-31T23:30:00Z', // Jan 1, 00:30, CET
    '2026-09-30T22:30:00Z', // Oct 1, 00:30, CEST
    '2026-10-04T21:59:00Z', // Sunday 23:59
    '2026-10-04T22:00:00Z', // Monday 00:00
    '2026-10-05T03:59:00Z', // 05:59
    '2026-10-05T04:00:00Z', // 06:00
    '2026-10-05T10:00:00Z', // 12:00
    '2026-10-05T16:00:00Z', // 18:00
    '2026-10-25T00:30:00Z', // 02:30 before DST ends
    '2026-10-25T01:30:00Z', // 02:30 after DST ends
  ]) await seed({ startedAt: new Date(time), hours: 1 });
  const service = createAnalyticsService(createAnalyticsRepository(pool), () => new Date('2026-11-02T12:00:00Z'));
  const result = await service.details(owner, 'all', 'all');
  assert.deepEqual(result.trend.map((row) => row.key), ['2026-01-01', '2026-10-01', '2026-10-04', '2026-10-05', '2026-10-25']);
  assert.deepEqual(result.months.map((row) => row.key), ['2026-01', '2026-10']);
  assert.deepEqual(result.startTimes.map((row) => row.shiftCount), [6, 1, 1, 2]);
  assert.equal(result.weekdays[0].shiftCount, 5);
  assert.equal(result.weekdays[6].shiftCount, 3);
  assert.equal(result.trend.at(-1).earningsPerHour, '100.00');
  assert.equal(result.trend.at(-1).shiftCount, 2);
});

test('details uses the four rolling periods and inclusive boundaries, rejects repeated filters and recalculates after changes', async () => {
  for (const days of [1, 10, 40, 100]) await seed({ startedAt: new Date(anchor - days * day) });
  await seed({ startedAt: new Date(Date.now() + day) });
  for (const [period, count] of [['week', 1], ['month', 2], ['three_months', 3], ['all', 4]]) {
    assert.equal((await request(`/analytics/details?period=${period}`)).body.details.shiftCount, count);
  }
  for (const query of ['period=', 'period=year', 'period=week&period=month', 'platform=',
    'platform=unknown', 'platform=glovo&platform=other']) {
    assert.equal((await request(`/analytics/details?${query}`)).status, 400);
  }
  await pool.query('DELETE FROM shifts');
  const now = new Date('2026-10-12T12:00:00Z');
  for (const offset of [-7 * day - 1, -7 * day, -1, 0, 1]) {
    await seed({ startedAt: new Date(now.getTime() + offset) });
  }
  const service = createAnalyticsService(createAnalyticsRepository(pool), () => now);
  assert.equal((await service.details(owner, 'week', 'all')).shiftCount, 3);
  await pool.query('DELETE FROM shifts');
  const id = await seed({ startedAt: new Date('2026-09-10T10:00:00Z') });
  const body = { startedAt: '2026-10-05T04:00:00.000Z', endedAt: '2026-10-05T06:00:00.000Z', distanceKm: null,
    platformEntries: [{ platform: 'other', earningsGross: '250.00', ordersCount: 10 }] };
  assert.equal((await request(`/shifts/${id}`, { method: 'PUT', body })).status, 200);
  const next = (await request('/analytics/details')).body.details;
  assert.equal(next.months.length, 1);
  assert.equal(next.months[0].key, '2026-10');
  assert.equal(next.months[0].totalEarnings, '250.00');
  assert.equal(next.startTimes[1].shiftCount, 1);
  assert.equal(next.platforms[0].platform, 'other');
  assert.equal((await request(`/shifts/${id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await request('/analytics/details')).body.details.shiftCount, 0);
});
