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
  await pool.query('DELETE FROM expenses');
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

const mainKpis = ['totalEarnings', 'totalHours', 'totalOrders', 'earningsPerHour', 'earningsPerKm', 'ordersPerHour'];

async function seedEvents(id, events) {
  for (const [platform, time] of events) {
    await pool.query('INSERT INTO order_events (shift_id, platform, clicked_at) VALUES ($1, $2, $3)', [id, platform, time]);
  }
}

async function hourlyDetails(query = 'calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z', auth = token) {
  const response = await request(`/analytics/details?${query}`, { auth });
  assert.equal(response.status, 200);
  assert.equal(response.cache, 'no-store');
  return response.body.details;
}

test('hourly activity uses final saved registrations, exact noon bounds and global sample before independent filters', async () => {
  const tracked = await seed({ startedAt: new Date('2026-10-05T09:30:00Z'), hours: 1,
    entries: [['glovo', '100', 50], ['wolt', '100', 50]] });
  const platforms = ['glovo', 'bolt_food', 'uber_eats', 'pyszne_pl', 'wolt', 'other'];
  const times = ['09:30', '09:40', '09:50', '10:00', '10:10', '10:20'];
  await seedEvents(tracked, platforms.map((platform, i) => [platform, `2026-10-05T${times[i]}:00Z`]));
  await seedEvents(tracked, [['glovo', '2026-10-05T09:29:00Z'], ['glovo', '2026-10-05T10:30:00Z'], ['glovo', '2026-10-05T10:31:00Z']]);
  await seed({ startedAt: new Date('2026-10-06T08:00:00Z') }); // No registrations, still in normal KPIs.
  const foreign = await seed({ userId: other, startedAt: new Date('2026-10-05T09:30:00Z'), hours: 1 });
  await seedEvents(foreign, [['glovo', '2026-10-05T10:00:00Z']]);
  const incomplete = await seed({ startedAt: new Date('2026-10-05T09:30:00Z'), hours: 1, entries: [] });
  await seedEvents(incomplete, [['glovo', '2026-10-05T10:00:00Z']]);
  await seed({ startedAt: new Date('2026-10-05T09:30:00Z'), status: 'active' });
  const details = await hourlyDetails();
  const hourly = details.hourlyActivity;
  assert.equal(details.shiftCount, 2);
  assert.equal(details.months[0].totalHours, 3);
  assert.equal(details.months[0].totalOrders, 105);
  assert.equal(hourly.groups.length, 12);
  assert.deepEqual(hourly.groups.map(group => group.key), Array.from({ length: 12 }, (_, i) => String(i)));
  assert.equal(hourly.groups[5].label, '10:00–12:00');
  for (const key of [5, 6]) {
    assert.equal(hourly.groups[key].registeredOrders, 3);
    assert.equal(hourly.groups[key].workHours, 0.5);
    assert.equal(hourly.groups[key].registeredOrdersPerHour, '6.00');
  }
  assert.deepEqual(hourly.bestIntervals, { status: 'available', registeredOrdersPerHour: '6.00', keys: ['5', '6'] });
  assert.deepEqual(hourly.quality, { coverageStatus: 'unknown', cohortShiftCount: 2, includedShiftCount: 1,
    shiftsWithoutValidEvents: 1, invalidEventCount: 3, excludedOverlapShiftCount: 0, overlapEventCount: 0, excludedEventCount: 3 });
  assert.equal(hourly.groups[0].registeredOrders, null);
  assert.equal(hourly.groups[0].workHours, 0);
  assert.equal(hourly.groups[0].registeredOrdersPerHour, null);
  for (const [i, platform] of platforms.entries()) {
    const filtered = await hourlyDetails(`calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z&eventPlatform=${platform}`);
    assert.equal(filtered.hourlyActivity.mode, 'count');
    assert.equal(filtered.hourlyActivity.groups[i < 3 ? 5 : 6].registeredOrders, 1);
    assert.ok(filtered.hourlyActivity.groups.every(group => group.workHours === null && group.registeredOrdersPerHour === null));
    assert.equal(filtered.hourlyActivity.bestIntervals.status, 'unavailable');
    assert.deepEqual(filtered.hourlyActivity.quality, hourly.quality);
    assert.deepEqual(filtered.bestWeekdays, details.bestWeekdays);
    assert.deepEqual(filtered.months, details.months);
  }
  const platformOnly = await hourlyDetails('calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z&platform=uber_eats');
  assert.equal(platformOnly.shiftCount, 0);
  assert.deepEqual(platformOnly.hourlyActivity, hourly);
  await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '0.2' } });
  const net = await hourlyDetails('calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z&mode=estimated_net');
  assert.deepEqual(net.hourlyActivity, hourly);
  const combined = await hourlyDetails('calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z&platform=glovo&eventPlatform=wolt');
  assert.equal(combined.hourlyActivity.groups[6].registeredOrders, 1);
  assert.equal(combined.months[0].totalOrders, 55);
  for (const deductionRate of ['0', '1']) {
    await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate } });
    assert.deepEqual((await hourlyDetails('calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z&mode=estimated_net')).hourlyActivity, hourly);
  }
  const owned = await hourlyDetails('calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z&user_id=' + owner, otherToken);
  assert.equal(owned.hourlyActivity.quality.cohortShiftCount, 1);
  assert.equal(owned.hourlyActivity.groups[6].registeredOrders, 1);
  assert.equal((await request('/analytics/details?eventPlatform=all', { auth: null })).status, 401);
  for (const query of ['eventPlatform=', 'eventPlatform=invalid', 'eventPlatform=glovo&eventPlatform=wolt']) {
    assert.equal((await request(`/analytics/details?${query}`)).status, 400);
  }
  assert.equal((await pool.query('SELECT COUNT(*)::integer AS count FROM order_events WHERE shift_id = $1', [tracked])).rows[0].count, 9);
  await pool.query("UPDATE shifts SET started_at = started_at - INTERVAL '1 microsecond' WHERE id = $1", [tracked]);
  const roundedTie = (await hourlyDetails()).hourlyActivity;
  assert.ok(roundedTie.groups[5].workHours > roundedTie.groups[6].workHours);
  assert.deepEqual(roundedTie.bestIntervals.keys, ['5', '6']); // Different raw rates, identical final ROUND(…, 2).
});

test('hourly events stay in the shift start cohort across midnight and a month boundary for calendar and legacy periods', async () => {
  const september = await seed({ startedAt: new Date('2026-09-30T21:30:00Z'), hours: 3 });
  await seedEvents(september, [['glovo', '2026-09-30T22:30:00Z']]); // Locally October, but September cohort.
  const october = await seed({ startedAt: new Date('2026-10-31T22:30:00Z'), hours: 1.5 });
  await seedEvents(october, [['glovo', '2026-10-31T22:30:00Z'], ['wolt', '2026-10-31T23:15:00Z'], ['glovo', '2026-11-01T00:00:00Z']]);
  const november = await seed({ startedAt: new Date('2026-11-01T10:00:00Z'), hours: 1 });
  await seedEvents(november, [['wolt', '2026-11-01T10:30:00Z']]);
  const details = await hourlyDetails();
  assert.equal(details.hourlyActivity.quality.cohortShiftCount, 1);
  assert.equal(details.hourlyActivity.groups[11].workHours, 0.5);
  assert.equal(details.hourlyActivity.groups[11].registeredOrders, 1);
  assert.equal(details.hourlyActivity.groups[0].workHours, 1);
  assert.equal(details.hourlyActivity.groups[0].registeredOrders, 1);
  assert.equal(details.hourlyActivity.quality.invalidEventCount, 1);
  const next = await hourlyDetails('calendar=month&anchor=2026-11-01&asOf=2026-11-02T12:00:00Z');
  assert.equal(next.hourlyActivity.quality.cohortShiftCount, 1);
  assert.equal(next.hourlyActivity.groups[0].registeredOrders, null);
  const service = createAnalyticsService(createAnalyticsRepository(pool), () => new Date('2026-11-02T12:00:00Z'));
  for (const period of ['week', 'month', 'three_months', 'all', 'current_week']) {
    const legacy = await service.details(owner, period, 'all', 'gross');
    assert.equal(legacy.hourlyActivity.groups.length, 12);
    assert.equal(legacy.hourlyActivity.asOf, legacy.to);
    assert.equal(legacy.hourlyActivity.quality.includedShiftCount, period === 'current_week' ? 0 : period === 'three_months' || period === 'all' ? 3 : 2);
  }
});

test('hourly work hours and event counts remain correct through spring and autumn Warsaw DST', async () => {
  for (const [start, hours, events, expectedRate, date] of [
    ['2026-03-29T01:00:00Z', 1, ['2026-03-29T01:00:00Z', '2026-03-29T01:30:00Z'], '2.00', '2026-03-29'],
    ['2026-10-25T00:00:00Z', 3, ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z'], '0.67', '2026-10-25'],
  ]) {
    await pool.query('DELETE FROM shifts');
    const id = await seed({ startedAt: new Date(start), hours });
    await seedEvents(id, events.map(time => ['glovo', time]));
    const details = await hourlyDetails(`calendar=week&anchor=${date}&asOf=2026-11-02T12:00:00Z`);
    assert.equal(details.hourlyActivity.groups[1].workHours, hours);
    assert.equal(details.hourlyActivity.groups[1].registeredOrders, 2);
    assert.equal(details.hourlyActivity.groups[1].registeredOrdersPerHour, expectedRate);
    assert.equal(details.hourlyActivity.groups.reduce((sum, group) => sum + group.workHours, 0), hours);
    assert.deepEqual(details.hourlyActivity.bestIntervals.keys, ['1']);
  }
});

test('overlapping cohort shifts including a shift without events are excluded only from hourly activity', async () => {
  const a = await seed({ startedAt: new Date('2026-10-05T08:00:00Z'), hours: 4 });
  await seed({ startedAt: new Date('2026-10-05T09:00:00Z'), hours: 1 });
  const c = await seed({ startedAt: new Date('2026-10-05T11:00:00Z'), hours: 2 });
  const d = await seed({ startedAt: new Date('2026-10-05T13:00:00Z'), hours: 1 });
  await seedEvents(a, [['glovo', '2026-10-05T09:00:00Z'], ['glovo', '2026-10-05T12:00:00Z']]);
  await seedEvents(c, [['glovo', '2026-10-05T12:00:00Z']]);
  await seedEvents(d, [['glovo', '2026-10-05T13:30:00Z']]);
  const details = await hourlyDetails();
  assert.equal(details.shiftCount, 4);
  assert.equal(details.months[0].totalHours, 8);
  assert.equal(details.months[0].totalOrders, 20);
  assert.equal(details.bestWeekdays.days[0].shiftCount, 4);
  assert.deepEqual(details.hourlyActivity.quality, { coverageStatus: 'unknown', cohortShiftCount: 4,
    includedShiftCount: 1, shiftsWithoutValidEvents: 1, invalidEventCount: 1,
    excludedOverlapShiftCount: 3, overlapEventCount: 2, excludedEventCount: 3 });
  assert.equal(details.hourlyActivity.groups[7].workHours, 1);
  assert.equal(details.hourlyActivity.groups[7].registeredOrders, 1);
  assert.equal((await calendarSummary('month', '2026-10-01', '2026-11-02T12:00:00Z')).totalHours, 8);
});

test('hourly availability distinguishes no observations, invalid events, real zero in a sample and missing platform registrations', async () => {
  assert.equal((await hourlyDetails()).hourlyActivity.emptyReason, 'no_completed_shifts');
  const id = await seed({ startedAt: new Date('2026-10-05T08:00:00Z'), hours: 4 });
  assert.equal((await hourlyDetails()).hourlyActivity.emptyReason, 'no_events');
  await seedEvents(id, [['glovo', '2026-10-05T07:00:00Z'], ['glovo', '2026-10-05T12:00:00Z']]);
  assert.equal((await hourlyDetails()).hourlyActivity.emptyReason, 'no_valid_events');
  await seedEvents(id, [['glovo', '2026-10-05T08:30:00Z']]);
  const hourly = (await hourlyDetails()).hourlyActivity;
  assert.equal(hourly.status, 'available');
  assert.equal(hourly.groups[6].workHours, 2);
  assert.equal(hourly.groups[6].registeredOrders, 0);
  assert.equal(hourly.groups[6].registeredOrdersPerHour, '0.00');
  assert.equal(hourly.groups[7].registeredOrdersPerHour, null);
  const missing = (await hourlyDetails('calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z&eventPlatform=wolt')).hourlyActivity;
  assert.equal(missing.status, 'available');
  assert.equal(missing.groups[5].registeredOrders, 0);
  assert.equal(missing.groups[5].workHours, null);
  await seed({ startedAt: new Date('2026-10-05T09:00:00Z'), hours: 1 });
  const excluded = (await hourlyDetails()).hourlyActivity;
  assert.equal(excluded.emptyReason, 'overlapping_shifts');
  assert.equal(excluded.quality.excludedOverlapShiftCount, 2);
  assert.equal(excluded.quality.excludedEventCount, 3);
  assert.ok(excluded.groups.every(group => group.registeredOrders === null));
});

test('best hourly interval uses the ratio of sums rather than event count or mean of shift rates', async () => {
  const a = await seed({ startedAt: new Date('2026-10-05T06:00:00Z'), hours: 4 });
  await seedEvents(a, [['glovo', '2026-10-05T06:30:00Z'], ['glovo', '2026-10-05T08:30:00Z']]);
  const b = await seed({ startedAt: new Date('2026-10-06T08:00:00Z'), hours: 2 });
  await seedEvents(b, [['glovo', '2026-10-06T08:30:00Z'], ['wolt', '2026-10-06T09:30:00Z']]);
  const c = await seed({ startedAt: new Date('2026-10-07T10:00:00Z'), hours: 0.25 });
  await seedEvents(c, [['wolt', '2026-10-07T10:05:00Z']]);
  const hourly = (await hourlyDetails()).hourlyActivity;
  assert.equal(hourly.groups[5].registeredOrders, 3);
  assert.equal(hourly.groups[5].workHours, 4);
  assert.equal(hourly.groups[5].registeredOrdersPerHour, '0.75');
  assert.equal(hourly.groups[6].registeredOrdersPerHour, '4.00');
  assert.deepEqual(hourly.bestIntervals.keys, ['6']);
});

test('event validity preserves PostgreSQL microseconds and excludes work not finished at the observation time', async () => {
  const id = await seed({ startedAt: new Date('2026-10-05T08:00:00Z'), hours: 1 });
  await seedEvents(id, [['glovo', '2026-10-05T08:00:00Z'], ['glovo', '2026-10-05T08:00:00.000001Z']]);
  await pool.query("UPDATE shifts SET started_at = started_at + INTERVAL '1 microsecond' WHERE id = $1", [id]);
  const future = await seed({ startedAt: new Date('2026-10-05T08:00:00Z'), hours: 2 });
  await seedEvents(future, [['glovo', '2026-10-05T09:30:00Z']]);
  const details = await hourlyDetails('calendar=month&anchor=2026-10-01&asOf=2026-10-05T09:00:00Z');
  assert.equal(details.hourlyActivity.quality.cohortShiftCount, 1);
  assert.equal(details.hourlyActivity.quality.invalidEventCount, 1);
  assert.equal(details.hourlyActivity.groups[5].registeredOrders, 1);
  assert.ok(details.hourlyActivity.groups[5].workHours < 1);
});

async function calendarSummary(calendar, anchorDate, asOf, mode = 'gross', auth = token) {
  const query = new URLSearchParams({ calendar, asOf, mode });
  if (anchorDate) query.set('anchor', anchorDate);
  const response = await request(`/analytics/summary?${query}`, { auth });
  assert.equal(response.status, 200);
  return response.body.summary;
}

test('full week compares all six KPIs with matching distance subsets, final orders, one duration and owner net profile', async () => {
  await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '0.2' } });
  const tracked = await seed({ startedAt: new Date('2026-10-19T08:00:00Z'), hours: 6, distance: '60',
    entries: [['glovo', '160', 8], ['wolt', '80', 4]] });
  await seed({ startedAt: new Date('2026-10-20T08:00:00Z'), hours: 2, entries: [['glovo', '160', 8]] });
  await seed({ startedAt: new Date('2026-10-12T08:00:00Z'), hours: 2, distance: '20',
    entries: [['glovo', '60', 3], ['wolt', '40', 1]] });
  await seed({ startedAt: new Date('2026-10-13T08:00:00Z'), hours: 2, entries: [['glovo', '100', 6]] });
  await seed({ userId: other, startedAt: new Date('2026-10-19T08:00:00Z'), entries: [['glovo', '900', 90]] });
  await seed({ userId: other, startedAt: new Date('2026-10-12T08:00:00Z'), entries: [['glovo', '300', 30]] });
  await pool.query(`INSERT INTO order_events (shift_id, platform, clicked_at) VALUES ($1, 'glovo', $2)`,
    [tracked, '2026-10-19T09:00:00Z']); // One registration must not replace the 20 final orders.
  for (const [mode, currentMoney, previousMoney] of [
    ['gross', ['400.00', '50.00', '4.00'], ['200.00', '50.00', '5.00']],
    ['estimated_net', ['320.00', '40.00', '3.20'], ['160.00', '40.00', '4.00']],
  ]) {
    const result = await calendarSummary('week', '2026-10-19', '2026-11-02T12:00:00Z', mode);
    const current = [currentMoney[0], 8, 20, currentMoney[1], currentMoney[2], '2.50'];
    const previous = [previousMoney[0], 4, 10, previousMoney[1], previousMoney[2], '2.50'];
    const percentages = ['100.0', '100.0', '100.0', '0.0', '-20.0', '0.0'];
    assert.equal(result.shiftCount, 2);
    assert.equal(result.distanceShiftCount, 1);
    assert.equal(result.comparison.previousShiftCount, 2);
    assert.equal(result.comparison.previousDistanceShiftCount, 1);
    assert.deepEqual(Object.keys(result.comparison.metrics).sort(), [...mainKpis].sort());
    for (const [i, key] of mainKpis.entries()) {
      assert.equal(result[key], current[i], key);
      assert.deepEqual(result.comparison.metrics[key], { previousValue: previous[i],
        changePercent: percentages[i], reason: null }, key);
    }
  }
  const foreign = await calendarSummary('week', '2026-10-19', '2026-11-02T12:00:00Z', 'gross', otherToken);
  assert.equal(foreign.totalEarnings, '900.00');
  assert.deepEqual(foreign.comparison.metrics.totalEarnings,
    { previousValue: '300.00', changePercent: '200.0', reason: null });
  const forged = await request('/analytics/summary?calendar=week&anchor=2026-10-19&asOf=2026-11-02T12:00:00Z&user_id=' + other);
  assert.equal(forged.body.summary.comparison.metrics.totalEarnings.previousValue, '200.00');
  await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '0' } });
  const netZeroRate = await calendarSummary('week', '2026-10-19', '2026-11-02T12:00:00Z', 'estimated_net');
  const gross = await calendarSummary('week', '2026-10-19', '2026-11-02T12:00:00Z');
  assert.deepEqual(netZeroRate.comparison, gross.comparison);
});

test('partial week uses local Wednesday cutoff across DST and excludes shifts ending later on both sides', async () => {
  const asOf = '2026-10-28T14:30:00Z'; // Warsaw Wednesday 15:30; previous Wednesday uses CEST.
  for (const [time, hours, earnings] of [
    ['2026-10-26T08:00:00Z', 2, '100'],
    ['2026-10-28T13:30:00Z', 1, '50'], // Ends exactly at current cutoff.
    ['2026-10-28T14:00:00Z', 1, '999'],
    ['2026-10-28T15:00:00Z', 1, '999'],
    ['2026-10-19T08:00:00Z', 2, '50'],
    ['2026-10-21T12:30:00Z', 1, '25'], // Ends exactly at previous cutoff (13:30Z).
    ['2026-10-21T13:00:00Z', 1, '999'],
    ['2026-10-21T14:00:00Z', 1, '999'],
  ]) await seed({ startedAt: new Date(time), hours, distance: '10', entries: [['glovo', earnings, 3]] });
  const result = await calendarSummary('week', '2026-10-26', asOf);
  assert.equal(result.comparison.previousWindow.observationCutoff, '2026-10-21T13:30:00.000Z');
  assert.equal(result.comparison.previousWindow.isPartial, true);
  assert.equal(result.shiftCount, 2);
  assert.equal(result.totalHours, 3);
  assert.equal(result.totalEarnings, '150.00');
  assert.equal(result.comparison.previousShiftCount, 2);
  assert.deepEqual(result.comparison.metrics.totalEarnings,
    { previousValue: '75.00', changePercent: '100.0', reason: null });
});

test('full months keep actual lengths and whole start cohorts, including shifts crossing the final midnight', async () => {
  for (const [time, hours, earnings] of [
    ['2026-02-01T08:00:00Z', 2, '100'],
    ['2026-02-28T22:00:00Z', 2, '100'], // Ends in March, but belongs wholly to February.
    ['2026-03-01T08:00:00Z', 2, '100'],
    ['2026-03-31T21:00:00Z', 2, '200'], // Ends in April, but belongs wholly to March.
  ]) await seed({ startedAt: new Date(time), hours, distance: '10', entries: [['glovo', earnings, 2]] });
  const result = await calendarSummary('month', '2026-03-01', '2026-04-02T12:00:00Z');
  assert.equal(result.selection.isPartial, false);
  assert.equal(result.comparison.previousWindow.isPartial, false);
  assert.equal(result.comparison.previousWindow.start, '2026-01-31T23:00:00.000Z');
  assert.equal(result.comparison.previousWindow.endExclusive, '2026-02-28T23:00:00.000Z');
  assert.equal(result.shiftCount, 2);
  assert.equal(result.totalEarnings, '300.00');
  assert.equal(result.totalHours, 4);
  assert.equal(result.comparison.previousShiftCount, 2);
  assert.deepEqual(result.comparison.metrics.totalEarnings,
    { previousValue: '200.00', changePercent: '50.0', reason: null });
  assert.equal(result.comparison.metrics.totalHours.previousValue, 4);
});

test('partial month uses the same local day and clock rather than a fraction of month length', async () => {
  for (const [time, hours, earnings] of [
    ['2026-11-02T13:00:00Z', 1, '200'], // 14:00 -> 15:00 Warsaw.
    ['2026-11-02T13:30:00Z', 1, '999'],
    ['2026-10-02T12:00:00Z', 1, '100'], // 14:00 -> 15:00 Warsaw.
    ['2026-10-02T12:30:00Z', 1, '999'],
    ['2026-10-03T12:00:00Z', 1, '999'],
  ]) await seed({ startedAt: new Date(time), hours, entries: [['glovo', earnings, 2]] });
  const result = await calendarSummary('month', '2026-11-01', '2026-11-02T14:00:00Z');
  assert.equal(result.comparison.previousWindow.observationCutoff, '2026-10-02T13:00:00.000Z');
  assert.equal(result.shiftCount, 1);
  assert.equal(result.totalEarnings, '200.00');
  assert.equal(result.comparison.previousShiftCount, 1);
  assert.deepEqual(result.comparison.metrics.totalEarnings,
    { previousValue: '100.00', changePercent: '100.0', reason: null });
});

test('March 31 saturates at February end but still requires completion by that cutoff for the partial comparison', async () => {
  await seed({ startedAt: new Date('2026-03-01T08:00:00Z'), entries: [['glovo', '100', 5]] });
  await seed({ startedAt: new Date('2026-02-28T21:00:00Z'), hours: 2, entries: [['glovo', '50', 2]] });
  await seed({ startedAt: new Date('2026-02-28T22:00:00Z'), hours: 2, entries: [['glovo', '999', 99]] });
  const result = await calendarSummary('month', '2026-03-01', '2026-03-31T13:00:00Z');
  const previous = result.comparison.previousWindow;
  assert.equal(previous.monthEndClamped, true);
  assert.equal(previous.isPartial, false);
  assert.equal(previous.observationCutoff, '2026-02-28T23:00:00.000Z');
  assert.equal(result.comparison.previousShiftCount, 1);
  assert.deepEqual(result.comparison.metrics.totalEarnings,
    { previousValue: '50.00', changePercent: '100.0', reason: null });
});

test('comparison percentages use unrounded NUMERIC sums and ratios, including estimated net', async () => {
  await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '0.1872' } });
  await seed({ startedAt: new Date('2026-10-19T08:00:00Z'), hours: 3, distance: '3', entries: [['glovo', '0.02', 2]] });
  await seed({ startedAt: new Date('2026-10-12T08:00:00Z'), hours: 3, distance: '3', entries: [['glovo', '0.01', 1]] });
  for (const mode of ['gross', 'estimated_net']) {
    const result = await calendarSummary('week', '2026-10-19', '2026-11-02T12:00:00Z', mode);
    for (const key of ['totalEarnings', 'earningsPerHour', 'earningsPerKm', 'totalOrders', 'ordersPerHour']) {
      assert.equal(result.comparison.metrics[key].changePercent, '100.0', key);
    }
    // Even a displayed previous rate of 0.00 is a valid nonzero raw base.
    assert.equal(result.comparison.metrics.earningsPerHour.previousValue, '0.00');
    assert.equal(result.comparison.metrics.earningsPerHour.reason, null);
  }
  await pool.query(`UPDATE shift_platform_entries e SET earnings_gross =
    CASE WHEN s.started_at = '2026-10-19T08:00:00Z' THEN 0.01 ELSE 0.03 END
    FROM shifts s WHERE e.shift_id = s.id`);
  for (const mode of ['gross', 'estimated_net']) {
    const result = await calendarSummary('week', '2026-10-19', '2026-11-02T12:00:00Z', mode);
    for (const key of ['totalEarnings', 'earningsPerHour', 'earningsPerKm']) {
      assert.equal(result.comparison.metrics[key].changePercent, '-66.7', key);
    }
  }
});

test('comparison distinguishes real zeros, missing observations, undefined ratios and zero previous bases', async () => {
  const currentId = await seed({ startedAt: new Date('2026-10-19T08:00:00Z'), distance: '0', entries: [['glovo', '0', 0]] });
  const previousId = await seed({ startedAt: new Date('2026-10-12T08:00:00Z'), distance: '10', entries: [['glovo', '100', 5]] });
  const read = () => calendarSummary('week', '2026-10-19', '2026-11-02T12:00:00Z');
  let result = await read();
  for (const key of ['totalEarnings', 'totalOrders', 'earningsPerHour', 'ordersPerHour']) {
    assert.equal(result.comparison.metrics[key].changePercent, '-100.0');
    assert.equal(result.comparison.metrics[key].reason, null);
  }
  assert.deepEqual(result.comparison.metrics.earningsPerKm,
    { previousValue: '10.00', changePercent: null, reason: 'undefined_metric' });
  await pool.query('UPDATE shifts SET distance_km = NULL, distance_source = NULL WHERE id = $1', [currentId]);
  assert.equal((await read()).comparison.metrics.earningsPerKm.reason, 'no_current_observations');
  await pool.query("UPDATE shifts SET distance_km = 10, distance_source = 'manual' WHERE id = $1", [currentId]);
  await pool.query('UPDATE shifts SET distance_km = 0 WHERE id = $1', [previousId]);
  assert.deepEqual((await read()).comparison.metrics.earningsPerKm,
    { previousValue: null, changePercent: null, reason: 'undefined_metric' });
  await pool.query('UPDATE shifts SET distance_km = NULL, distance_source = NULL WHERE id = $1', [previousId]);
  assert.equal((await read()).comparison.metrics.earningsPerKm.reason, 'no_previous_observations');
  await pool.query('UPDATE shift_platform_entries SET earnings_gross = 0, orders_count = 0 WHERE shift_id = $1', [previousId]);
  result = await read();
  assert.deepEqual(result.comparison.metrics.totalEarnings,
    { previousValue: '0.00', changePercent: null, reason: 'previous_zero' });
  await pool.query('UPDATE shift_platform_entries SET earnings_gross = 100 WHERE shift_id = $1', [currentId]);
  assert.equal((await read()).comparison.metrics.totalEarnings.changePercent, null); // No artificial +100%.
  await pool.query('DELETE FROM shifts WHERE id = $1', [previousId]);
  result = await read();
  for (const key of mainKpis.filter(key => key !== 'earningsPerKm')) {
    assert.equal(result.comparison.metrics[key].reason, 'no_previous_observations');
    assert.equal(result.comparison.metrics[key].changePercent, null);
  }
  await pool.query('DELETE FROM shifts WHERE id = $1', [currentId]);
  await seed({ startedAt: new Date('2026-10-12T08:00:00Z') });
  result = await read();
  assert.equal(result.totalEarnings, '0.00');
  assert.equal(result.comparison.metrics.totalEarnings.reason, 'no_current_observations');
  assert.equal(result.comparison.metrics.totalEarnings.changePercent, null);
});

test('100 percent deductions give genuine financial zero bases, while all and legacy clients have no comparison', async () => {
  await seed({ startedAt: new Date('2026-10-19T08:00:00Z'), distance: '10' });
  await seed({ startedAt: new Date('2026-10-12T08:00:00Z'), distance: '10' });
  await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '1' } });
  const net = await calendarSummary('week', '2026-10-19', '2026-11-02T12:00:00Z', 'estimated_net');
  for (const key of ['totalEarnings', 'earningsPerHour', 'earningsPerKm']) {
    assert.equal(net[key], '0.00');
    assert.deepEqual(net.comparison.metrics[key], { previousValue: '0.00', changePercent: null, reason: 'previous_zero' });
  }
  assert.equal(net.comparison.metrics.ordersPerHour.changePercent, '0.0');
  const all = await calendarSummary('all', undefined, '2026-11-02T12:00:00Z');
  assert.equal(all.comparison, null);
  for (const period of ['week', 'month', 'three_months', 'all', 'current_week']) {
    const legacy = await request(`/analytics/summary?period=${period}`);
    assert.equal(legacy.status, 200);
    assert.equal(Object.hasOwn(legacy.body.summary, 'comparison'), false);
    assert.equal(Object.hasOwn(legacy.body.summary, 'selection'), false);
  }
});

test('calendar summary and details share half-open Warsaw bounds, ownership and unchanged financial aggregation', async () => {
  await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '0.2' } });
  const dateKey = (time) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date(time));
  for (const [calendar, date, start, end, asOf] of [
    ['week', '2026-03-29', '2026-03-22T23:00:00Z', '2026-03-29T22:00:00Z', '2026-03-30T12:00:00Z'],
    ['week', '2026-10-25', '2026-10-18T22:00:00Z', '2026-10-25T23:00:00Z', '2026-10-26T12:00:00Z'],
    ['month', '2026-09-30', '2026-08-31T22:00:00Z', '2026-09-30T22:00:00Z', '2026-10-01T12:00:00Z'],
    ['month', '2026-10-31', '2026-09-30T22:00:00Z', '2026-10-31T23:00:00Z', '2026-11-01T12:00:00Z'],
  ]) {
    await pool.query('DELETE FROM expenses');
    await pool.query('DELETE FROM shifts');
    const startMs = Date.parse(start), endMs = Date.parse(end);
    for (const instant of [startMs - 1, startMs, endMs - 1, endMs]) {
      await seed({ startedAt: new Date(instant), hours: 1 / 3600000,
        entries: [['glovo', '0.10', 1], ['wolt', '0.20', 1]] });
      await pool.query(`INSERT INTO expenses (user_id, category, amount, expense_date)
        VALUES ($1, 'fuel', 1, $2)`, [owner, dateKey(instant)]);
    }
    await seed({ userId: other, startedAt: new Date(startMs), entries: [['other', '999.00', 99]] });
    await seed({ startedAt: new Date(startMs), entries: [], hours: 1 });
    await seed({ startedAt: new Date(startMs), status: 'active' });
    await pool.query(`INSERT INTO expenses (user_id, category, amount, expense_date)
      VALUES ($1, 'fuel', 999, $2)`, [other, dateKey(startMs)]);
    const query = new URLSearchParams({ calendar, anchor: date, asOf });
    for (const [mode, amount] of [['gross', '0.60'], ['estimated_net', '0.48']]) {
      query.set('mode', mode);
      const summaryResponse = await request(`/analytics/summary?${query}`);
      const detailsResponse = await request(`/analytics/details?${query}`);
      assert.equal(summaryResponse.status, 200);
      assert.equal(detailsResponse.status, 200);
      assert.equal(summaryResponse.cache, 'no-store');
      const s = summaryResponse.body.summary, d = detailsResponse.body.details;
      assert.deepEqual(s.selection, d.selection);
      assert.equal(s.selection.start, new Date(startMs).toISOString());
      assert.equal(s.selection.endExclusive, new Date(endMs).toISOString());
      assert.equal(s.selection.observationCutoff, s.selection.endExclusive);
      assert.equal(s.selection.isPartial, false);
      assert.equal(s.shiftCount, 2);
      assert.equal(d.shiftCount, 2);
      assert.equal(s.incompleteShiftCount, 1);
      assert.equal(d.incompleteShiftCount, 1);
      assert.equal(s.totalEarnings, amount);
      assert.equal(s.totalOrders, 4);
      assert.equal(s.totalHours, 2 / 3600000);
      assert.equal(d.months[0].totalHours, s.totalHours);
      for (const field of ['trend', 'months', 'weekdays', 'startTimes']) {
        for (const group of d[field].filter(group => group.shiftCount)) {
          assert.equal(group.ordersPerHour, '7200000.00');
        }
      }
      assert.equal(s.totalExpenses, '2.00');
      assert.equal(s.expenseCount, 2);
      assert.deepEqual(d.trend.map((row) => row.key), [dateKey(startMs), dateKey(endMs - 1)]);
      assert.ok(d.trend.every((row) => row.totalEarnings === (mode === 'gross' ? '0.30' : '0.24')));
      const filtered = (await request(`/analytics/details?${query}&platform=glovo`)).body.details;
      assert.equal(filtered.shiftCount, 2);
      assert.ok(filtered.trend.every((row) => row.earningsPerHour === null));
      assert.deepEqual(filtered.platforms, d.platforms);
      for (const field of ['comparison', 'bestWeekdays', 'hourlyActivity', 'availableRange']) {
        assert.equal(Object.hasOwn(s, field), field === 'comparison');
        assert.equal(Object.hasOwn(d, field), ['bestWeekdays', 'hourlyActivity'].includes(field));
      }
    }
    for (const endpoint of ['summary', 'details']) {
      query.set('mode', 'gross');
      assert.equal((await request(`/analytics/${endpoint}?${query}`, { auth: null })).status, 401);
      const foreign = await request(`/analytics/${endpoint}?${query}&user_id=${owner}`, { auth: otherToken });
      assert.equal(foreign.status, 200);
      assert.equal(foreign.body[endpoint].shiftCount, 1);
      assert.equal(endpoint === 'summary' ? foreign.body.summary.totalEarnings : foreign.body.details.trend[0].totalEarnings, '999.00');
    }
  }
});

test('calendar current windows and all respect exact asOf, omit future work and keep full Warsaw expense dates', async () => {
  const asOf = '2026-10-28T11:00:00.000Z';
  const cutoff = Date.parse(asOf);
  for (const [calendar, anchorDate, start] of [
    ['week', '2026-10-30', '2026-10-25T23:00:00Z'],
    ['month', '2026-10-31', '2026-09-30T22:00:00Z'],
    ['all', undefined, '2026-06-01T00:00:00Z'],
  ]) {
    await pool.query('DELETE FROM shifts');
    await pool.query('DELETE FROM expenses');
    const startMs = Date.parse(start);
    for (const instant of [startMs - 1, startMs, cutoff - 1, cutoff, cutoff + 1]) {
      await seed({ startedAt: new Date(instant), hours: 1 / 3600000 });
    }
    await seed({ startedAt: new Date(cutoff - 3600000), hours: 2 });
    for (const date of ['2026-10-28', '2026-10-29']) {
      await pool.query(`INSERT INTO expenses (user_id, category, amount, expense_date)
        VALUES ($1, 'phone', 1, $2)`, [owner, date]);
    }
    const query = new URLSearchParams({ calendar, asOf });
    if (anchorDate) query.set('anchor', anchorDate);
    const s = (await request(`/analytics/summary?${query}`)).body.summary;
    const d = (await request(`/analytics/details?${query}`)).body.details;
    assert.deepEqual(s.selection, d.selection);
    assert.equal(s.selection.asOf, asOf);
    assert.equal(s.selection.observationCutoff, asOf);
    assert.equal(s.selection.isPartial, calendar !== 'all');
    assert.equal(s.shiftCount, calendar === 'all' ? 3 : 2);
    assert.equal(d.shiftCount, s.shiftCount);
    assert.equal(s.totalExpenses, '1.00');
    assert.equal(s.totalEarnings, calendar === 'all' ? '300.00' : '200.00');
  }
  const first = (await request('/analytics/summary?calendar=all')).body.summary;
  const replay = (await request(`/analytics/details?calendar=all&asOf=${first.selection.asOf}`)).body.details;
  assert.deepEqual(first.selection, replay.selection);
  assert.equal(Object.hasOwn((await request('/analytics/summary')).body.summary, 'selection'), false);
  assert.equal(Object.hasOwn((await request('/analytics/details?period=current_week')).body.details, 'selection'), false);
});

test('both analytics endpoints reject invalid calendar queries without changing legacy defaults', async () => {
  for (const query of [
    'calendar=year', 'calendar=week&period=week&anchor=2026-10-26', 'calendar=week', 'calendar=month',
    'calendar=all&anchor=2026-10-26', 'calendar=week&anchor=2026-02-30',
    'calendar=week&calendar=month&anchor=2026-10-26', 'calendar=all&asOf=bad',
    `calendar=all&asOf=${new Date(Date.now() + day).toISOString()}`,
    'calendar=week&anchor=2026-11-02&asOf=2026-10-28T11:00:00.000Z',
    'calendar=month&anchor=2026-11-01&asOf=2026-10-28T11:00:00.000Z',
  ]) {
    for (const endpoint of ['summary', 'details']) {
      assert.equal((await request(`/analytics/${endpoint}?${query}`)).status, 400, `${endpoint}?${query}`);
    }
  }
  for (const endpoint of ['summary', 'details']) {
    const result = await request(`/analytics/${endpoint}`);
    assert.equal(result.status, 200);
    assert.equal(result.body[endpoint].period, 'all');
  }
});

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
  assert.deepEqual(zero.bestWeekdays, { status: 'all_zero', earningsPerHour: '0.00', days: [] });
  assert.equal(zero.trend[0].totalHours, net.trend[0].totalHours);
  assert.equal(zero.trend[0].ordersPerHour, net.trend[0].ordersPerHour);
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
    assert.equal(details.months[0].totalHours, 4);
    assert.equal(details.months[0].ordersPerHour, '0.50'); // Two final orders over four hours.
    assert.deepEqual(details.bestWeekdays.days.map(day => day.key), ['1']);
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
  assert.equal(details.weekdays[0].totalHours, 0);
  assert.equal(details.weekdays[0].ordersPerHour, null);
  assert.deepEqual(details.bestWeekdays, { status: 'no_data', earningsPerHour: null, days: [] });
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
  for (const field of ['trend', 'months', 'weekdays', 'startTimes']) {
    const group = all[field].find(group => group.shiftCount);
    assert.equal(group.totalHours, 8);
    assert.equal(group.ordersPerHour, '2.50'); // (12 + 8) / (6 + 2), not the mean of 2 and 4.
  }
  assert.deepEqual(all.bestWeekdays, { status: 'available', earningsPerHour: '50.04',
    days: [{ key: '1', shiftCount: 2, totalHours: 8, earningsPerHour: '50.04' }] });
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
      assert.equal(row.totalHours, null);
      assert.equal(row.ordersPerHour, null);
    }
  }
  assert.deepEqual(filtered.platforms, all.platforms);
  assert.deepEqual(filtered.bestWeekdays, all.bestWeekdays);
  const absent = (await request('/analytics/details?platform=uber_eats')).body.details;
  assert.equal(absent.shiftCount, 0);
  assert.deepEqual(absent.trend, []);
  assert.deepEqual(absent.bestWeekdays, all.bestWeekdays);
  assert.equal(absent.weekdays[0].totalHours, null);
  await pool.query('UPDATE shift_platform_entries SET earnings_gross = 0, orders_count = 0');
  const zero = (await request('/analytics/details')).body.details;
  assert.equal(zero.trend[0].totalEarnings, '0.00');
  assert.equal(zero.trend[0].earningsPerHour, '0.00');
  assert.equal(zero.trend[0].earningsPerOrder, null);
  assert.ok(zero.platforms.every((row) => row.earningsShare === null && row.ordersShare === null));
  assert.equal(zero.trend[0].ordersPerHour, '0.00');
  assert.deepEqual(zero.bestWeekdays, { status: 'all_zero', earningsPerHour: '0.00', days: [] });
});

test('best weekdays maximize global earnings per hour rather than earnings totals or average shift rates', async () => {
  await seed({ startedAt: new Date('2026-10-05T06:00:00Z'), hours: 10, entries: [['glovo', '400', 20]] });
  const tracked = await seed({ startedAt: new Date('2026-10-06T08:00:00Z'), hours: 2,
    entries: [['glovo', '80', 4], ['wolt', '40', 2]] });
  await seed({ startedAt: new Date('2026-10-06T12:00:00Z'), hours: 1, entries: [['glovo', '30', 3]] });
  await seed({ startedAt: new Date('2026-10-07T08:00:00Z'), hours: 1, entries: [['wolt', '49', 1]] });
  await seed({ userId: other, startedAt: new Date('2026-10-10T08:00:00Z'), entries: [['glovo', '9000', 99]] });
  await pool.query(`INSERT INTO order_events (shift_id, platform, clicked_at) VALUES ($1, 'glovo', $2)`,
    [tracked, '2026-10-06T09:00:00Z']); // Independent of the nine final Tuesday orders.
  await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '0.2' } });
  for (const [mode, rate] of [['gross', '50.00'], ['estimated_net', '40.00']]) {
    const result = await request(`/analytics/details?calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z&mode=${mode}`);
    assert.equal(result.status, 200);
    const details = result.body.details;
    assert.deepEqual(details.bestWeekdays, { status: 'available', earningsPerHour: rate,
      days: [{ key: '2', shiftCount: 2, totalHours: 3, earningsPerHour: rate }] });
    assert.equal(details.weekdays[1].totalHours, 3);
    assert.equal(details.weekdays[1].ordersPerHour, '3.00');
    for (const platform of ['glovo', 'wolt', 'uber_eats']) {
      const filtered = (await request(`/analytics/details?calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z&mode=${mode}&platform=${platform}`)).body.details;
      assert.deepEqual(filtered.bestWeekdays, details.bestWeekdays);
      for (const field of ['trend', 'months', 'weekdays', 'startTimes']) {
        assert.ok(filtered[field].every(group => group.totalHours === null && group.ordersPerHour === null && group.earningsPerHour === null));
      }
    }
  }
  const foreign = await request('/analytics/details?period=all&user_id=' + owner, { auth: otherToken });
  assert.deepEqual(foreign.body.details.bestWeekdays, { status: 'available', earningsPerHour: '4500.00',
    days: [{ key: '6', shiftCount: 1, totalHours: 2, earningsPerHour: '4500.00' }] });
});

test('best weekdays return every tie after NUMERIC rounding, with natural weekday order and the current net profile', async () => {
  for (const [date, amount] of [['2026-10-05', '100.01'], ['2026-10-10', '100.00'], ['2026-10-11', '100.02']]) {
    await seed({ startedAt: new Date(`${date}T08:00:00Z`), hours: 3, entries: [['glovo', amount, 3]] });
  }
  const gross = (await request('/analytics/details?period=all')).body.details;
  assert.equal(gross.bestWeekdays.earningsPerHour, '33.34');
  assert.deepEqual(gross.bestWeekdays.days.map(day => day.key), ['1', '7']);
  assert.ok(gross.bestWeekdays.days.every(day => day.shiftCount === 1 && day.totalHours === 3));
  await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '0.2' } });
  const net = (await request('/analytics/details?mode=estimated_net')).body.details;
  assert.equal(net.bestWeekdays.earningsPerHour, '26.67');
  assert.deepEqual(net.bestWeekdays.days.map(day => day.key), ['1', '6', '7']);
  for (const field of ['trend', 'months', 'weekdays', 'startTimes']) {
    assert.deepEqual(net[field].map(group => [group.totalHours, group.ordersPerHour]),
      gross[field].map(group => [group.totalHours, group.ordersPerHour]));
  }
  await request('/settings', { method: 'PUT', body: { netProfile: 'custom', deductionRate: '0' } });
  assert.deepEqual((await request('/analytics/details?mode=estimated_net')).body.details.bestWeekdays, gross.bestWeekdays);
});

test('weekday ranking and hours use Warsaw start dates, whole overnight shifts and actual DST durations', async () => {
  await seed({ startedAt: new Date('2026-10-02T21:30:00Z'), hours: 2, entries: [['glovo', '100', 4]] }); // Friday 23:30 -> Saturday.
  await seed({ startedAt: new Date('2026-10-04T22:30:00Z'), hours: 1, entries: [['glovo', '100', 2]] }); // Monday in Warsaw.
  await seed({ startedAt: new Date('2026-10-25T00:30:00Z'), hours: 2, entries: [['glovo', '300', 6]] }); // 02:30 CEST -> 03:30 CET: two hours.
  const details = (await request('/analytics/details?calendar=month&anchor=2026-10-01&asOf=2026-11-02T12:00:00Z')).body.details;
  assert.deepEqual(details.bestWeekdays, { status: 'available', earningsPerHour: '150.00',
    days: [{ key: '7', shiftCount: 1, totalHours: 2, earningsPerHour: '150.00' }] });
  assert.deepEqual(details.trend.map(group => [group.key, group.totalHours]),
    [['2026-10-02', 2], ['2026-10-05', 1], ['2026-10-25', 2]]);
  assert.equal(details.weekdays[4].totalHours, 2);
  assert.equal(details.weekdays[5].totalHours, 0);
  assert.equal(details.months[0].totalHours, 5);
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
