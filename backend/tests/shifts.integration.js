import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { createDatabasePool } from '../src/config/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { createShiftRepository } from '../src/repositories/shiftRepository.js';

const schema = `shifts_test_${randomUUID().replaceAll('-', '')}`;
const secret = randomBytes(32).toString('hex');
const entry = { platform: 'glovo', earningsGross: '160.50', ordersCount: 10 };
const times = { startedAt: '2026-10-10T08:00:00.000Z', endedAt: '2026-10-10T10:30:00.000Z', platformEntries: [entry] };
let adminPool;
let pool;
let schemaCreated = false;
let server;
let baseUrl;
let firstUser;
let secondUser;
let token;
let secondToken;

before(async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'Set TEST_DATABASE_URL to a dedicated PostgreSQL test database.');
  adminPool = createDatabasePool(connectionString);
  await adminPool.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  const url = new URL(connectionString);
  url.searchParams.set('options', `-c search_path=${schema}`);
  pool = createDatabasePool(url.toString());
  await runMigrations(pool);
  const { rows } = await pool.query(`
    INSERT INTO users (email, password_hash) VALUES ('first@example.com', 'test-only'), ('second@example.com', 'test-only')
    RETURNING id
  `);
  [firstUser, secondUser] = rows.map((row) => row.id);
  token = jwt.sign({}, secret, { subject: String(firstUser), expiresIn: '1h' });
  secondToken = jwt.sign({}, secret, { subject: String(secondUser), expiresIn: '1h' });
  server = createApp(pool, secret).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/shifts`;
});

beforeEach(async () => {
  // This pool is restricted to the newly created random test schema.
  await pool.query('DELETE FROM shifts');
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (pool) await pool.end();
  if (adminPool) {
    try {
      if (schemaCreated) await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally {
      await adminPool.end();
    }
  }
});

async function request(path = '', { method = 'GET', body, auth = token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(auth && { Authorization: `Bearer ${auth}` }), ...(body && { 'Content-Type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

async function completedShift(auth = token) {
  const { body: { shift } } = await request('/start', { method: 'POST', auth });
  return (await request(`/${shift.id}/finish`, { method: 'POST', auth })).body.shift;
}

test('start uses the authenticated owner and server time; only one active shift per account', async () => {
  assert.deepEqual((await request('/active')).body, { shift: null });
  const beforeStart = Date.now();
  const result = await request('/start', { method: 'POST', body: { user_id: secondUser, startedAt: times.startedAt } });
  assert.equal(result.status, 201);
  const shift = result.body.shift;
  assert.equal(shift.status, 'active');
  assert.ok(new Date(shift.startedAt).getTime() >= beforeStart);
  assert.equal(shift.endedAt, null);
  assert.equal(shift.distanceKm, null);
  assert.equal(shift.distanceSource, null);
  assert.equal(shift.durationSeconds, null);
  assert.deepEqual((await request('/active')).body.shift, shift);
  assert.equal((await request('/start', { method: 'POST' })).status, 409);
  assert.equal((await request('/start', { method: 'POST', auth: secondToken })).status, 201);
  const { rows: [row] } = await pool.query('SELECT user_id FROM shifts WHERE id = $1', [shift.id]);
  assert.equal(row.user_id, firstUser);
  assert.deepEqual((await request()).body.shifts, []);
});

test('finish records server end time and duration, persists without distance, and rejects a second finish', async () => {
  const { body: { shift } } = await request('/start', { method: 'POST' });
  const beforeFinish = Date.now();
  const result = await request(`/${shift.id}/finish`, { method: 'POST', body: { endedAt: times.endedAt } });
  assert.equal(result.status, 200);
  const completed = result.body.shift;
  assert.equal(completed.status, 'completed');
  assert.ok(new Date(completed.endedAt).getTime() >= beforeFinish);
  assert.ok(completed.durationSeconds > 0);
  assert.equal(completed.durationSeconds, (new Date(completed.endedAt) - new Date(completed.startedAt)) / 1000);
  assert.equal(completed.distanceKm, null);
  assert.deepEqual((await request('/active')).body, { shift: null });
  assert.deepEqual((await request(`/${shift.id}`)).body.shift, completed);
  assert.equal((await request(`/${shift.id}/finish`, { method: 'POST' })).status, 409);
  assert.deepEqual((await request(`/${shift.id}`)).body.shift, completed);
  assert.equal((await request('/start', { method: 'POST' })).status, 201);
});

test('editing times recalculates duration and sets, zeroes or clears optional manual distance', async () => {
  const shift = await completedShift();
  for (const [distanceKm, expected, source] of [['64.50', '64.50', 'manual'], [0, '0.00', 'manual'], [null, null, null]]) {
    const result = await request(`/${shift.id}`, {
      method: 'PUT', body: { ...times, distanceKm, distanceSource: 'gps', user_id: secondUser, status: 'active' },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.shift.durationSeconds, 9000);
    assert.equal(result.body.shift.distanceKm, expected);
    assert.equal(result.body.shift.distanceSource, source);
    assert.equal(result.body.shift.status, 'completed');
    const { rows: [row] } = await pool.query('SELECT user_id, distance_km, distance_source FROM shifts WHERE id = $1', [shift.id]);
    assert.deepEqual(row, { user_id: firstUser, distance_km: expected, distance_source: source });
  }
});

test('invalid update data leaves the saved shift intact; active shifts cannot be edited', async () => {
  const shift = await completedShift();
  for (const body of [{}, { ...times, endedAt: times.startedAt }, { ...times, distanceKm: -1 },
    { ...times, startedAt: 'invalid' }, { ...times, distanceKm: '1.234' }]) {
    assert.equal((await request(`/${shift.id}`, { method: 'PUT', body })).status, 400);
  }
  assert.deepEqual((await request(`/${shift.id}`)).body.shift, shift);
  const { body: { shift: active } } = await request('/start', { method: 'POST' });
  assert.equal((await request(`/${active.id}`, { method: 'PUT', body: times })).status, 409);
  for (const id of ['invalid', '0', '2147483648']) assert.equal((await request(`/${id}`)).status, 400);
  assert.equal((await request('/2147483647')).status, 404);
});

test('history is newest first and all reads and mutations exclude another account', async () => {
  const older = await completedShift();
  await request(`/${older.id}`, { method: 'PUT', body: times });
  const newer = await completedShift();
  const other = await completedShift(secondToken);
  const { body: { shift: otherActive } } = await request('/start', { method: 'POST', auth: secondToken });
  assert.deepEqual((await request(`?user_id=${secondUser}`)).body.shifts.map((row) => row.id), [newer.id, older.id]);
  assert.deepEqual((await request(`?user_id=${firstUser}`, { auth: secondToken })).body.shifts.map((row) => row.id), [other.id]);
  assert.equal((await request(`/active?user_id=${secondUser}`)).body.shift, null);
  for (const id of [other.id, otherActive.id]) {
    for (const [path, method, body] of [[`/${id}`, 'GET'], [`/${id}/finish`, 'POST'],
      [`/${id}`, 'PUT', times], [`/${id}`, 'DELETE']]) {
      const result = await request(`${path}?user_id=${secondUser}`, { method, body });
      assert.equal(result.status, 404);
      assert.equal(result.body.message, 'Nie znaleziono zmiany.');
    }
  }
  assert.deepEqual((await request(`/${other.id}`, { auth: secondToken })).body.shift, other);
  assert.equal((await request('/active', { auth: secondToken })).body.shift.id, otherActive.id);
});

test('delete removes only the owned shift and deleting an active shift releases the start restriction', async () => {
  const completed = await completedShift();
  assert.equal((await request(`/${completed.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await request(`/${completed.id}`)).status, 404);
  assert.deepEqual((await request()).body.shifts, []);
  const { body: { shift: active } } = await request('/start', { method: 'POST' });
  assert.equal((await request(`/${active.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await request('/start', { method: 'POST' })).status, 201);
});

test('every shift endpoint requires authorization before reading or changing data', async () => {
  for (const auth of [null, 'invalid']) {
    for (const [path, method] of [['', 'GET'], ['/active', 'GET'], ['/start', 'POST'], ['/1', 'GET'],
      ['/1/finish', 'POST'], ['/1', 'PUT'], ['/1', 'DELETE']]) {
      assert.equal((await request(path, { method, auth })).status, 401);
    }
  }
  assert.deepEqual((await request()).body.shifts, []);
});

test('one or multiple platform entries persist and totals come from saved values, not client totals', async () => {
  const shift = await completedShift();
  let result = await request(`/${shift.id}`, { method: 'PUT', body: { ...times, totalEarnings: 999, totalOrders: 999 } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.shift.platformEntries, [entry]);
  assert.equal(result.body.shift.totalEarnings, '160.50');
  assert.equal(result.body.shift.totalOrders, 10);
  const entries = [entry, { platform: 'bolt_food', earningsGross: '75.20', ordersCount: 4 }];
  result = await request(`/${shift.id}`, { method: 'PUT', body: { ...times, platformEntries: entries } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.shift.platformEntries, entries);
  assert.equal(result.body.shift.totalEarnings, '235.70');
  assert.equal(result.body.shift.totalOrders, 14);
  assert.deepEqual((await request(`/${shift.id}`)).body.shift, result.body.shift);
  assert.deepEqual((await request()).body.shifts, [result.body.shift]);
  result = await request(`/${shift.id}`, { method: 'PUT', body: { ...times, platformEntries: [
    { ...entry, earningsGross: '0.10', ordersCount: 0 },
    { platform: 'bolt_food', earningsGross: '0.20', ordersCount: 0 },
  ] } });
  assert.equal(result.body.shift.totalEarnings, '0.30');
  assert.equal(result.body.shift.totalOrders, 0);
});

test('all six platforms can be saved together and read back with correct totals', async () => {
  const shift = await completedShift();
  const entries = ['glovo', 'bolt_food', 'uber_eats', 'pyszne_pl', 'wolt', 'other']
    .map((platform) => ({ ...entry, platform }));
  const result = await request(`/${shift.id}`, { method: 'PUT', body: { ...times, platformEntries: entries } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.shift.platformEntries, entries);
  assert.equal(result.body.shift.totalEarnings, '963.00');
  assert.equal(result.body.shift.totalOrders, 60);
  assert.deepEqual((await request(`/${shift.id}`)).body.shift, result.body.shift);
});

test('editing replaces or removes entries; deleting the shift cascades to its platform entries', async () => {
  const shift = await completedShift();
  await request(`/${shift.id}`, { method: 'PUT', body: { ...times, platformEntries: [entry,
    { platform: 'other', earningsGross: '20.00', ordersCount: 2 }] } });
  const replacement = { platform: 'uber_eats', earningsGross: '0.00', ordersCount: 0 };
  const result = await request(`/${shift.id}`, { method: 'PUT', body: { ...times, platformEntries: [replacement] } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.shift.platformEntries, [replacement]);
  assert.equal(result.body.shift.totalEarnings, '0.00');
  assert.equal(result.body.shift.totalOrders, 0);
  const { rows } = await pool.query('SELECT platform FROM shift_platform_entries WHERE shift_id = $1', [shift.id]);
  assert.deepEqual(rows, [{ platform: 'uber_eats' }]);
  assert.equal((await request(`/${shift.id}`, { method: 'DELETE' })).status, 204);
  assert.deepEqual((await pool.query('SELECT id FROM shift_platform_entries WHERE shift_id = $1', [shift.id])).rows, []);
});

test('invalid platform data and another owner cannot change saved entries or shift times', async () => {
  const shift = await completedShift();
  const saved = (await request(`/${shift.id}`, { method: 'PUT', body: times })).body.shift;
  for (const platformEntries of [undefined, [], [entry, entry], [{ ...entry, platform: 'unknown' }],
    [{ ...entry, earningsGross: -1 }], [{ ...entry, ordersCount: 1.5 }], [{ ...entry, ordersCount: -1 }]]) {
    assert.equal((await request(`/${shift.id}`, { method: 'PUT', body: { ...times, platformEntries } })).status, 400);
  }
  for (const method of ['GET', 'PUT', 'DELETE']) {
    assert.equal((await request(`/${shift.id}?user_id=${firstUser}`, { method, auth: secondToken,
      body: method === 'PUT' ? { ...times, platformEntries: [{ ...entry, earningsGross: '999' }] } : undefined })).status, 404);
  }
  assert.deepEqual((await request('', { auth: secondToken })).body.shifts, []);
  assert.deepEqual((await request(`/${shift.id}`)).body.shift, saved);
});

test('a failed entry insert rolls back both the shift update and replacement of existing entries', async () => {
  const shift = await completedShift();
  const saved = (await request(`/${shift.id}`, { method: 'PUT', body: times })).body.shift;
  // Bypass API validation to verify the transaction when PostgreSQL rejects an insert.
  await assert.rejects(createShiftRepository(pool).update(firstUser, shift.id, {
    startedAt: new Date(times.startedAt), endedAt: new Date('2026-10-10T12:00:00.000Z'),
    distanceKm: '25', platformEntries: [entry, entry],
  }), { code: '23505' });
  assert.deepEqual((await request(`/${shift.id}`)).body.shift, saved);
});
