import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { createDatabasePool } from '../src/config/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { createAnalyticsService } from '../src/services/analyticsService.js';
import { createAnalyticsRepository } from '../src/repositories/analyticsRepository.js';

const schema = `expenses_test_${randomUUID().replaceAll('-', '')}`;
const secret = randomBytes(32).toString('hex');
const valid = { category: 'fuel', amount: '12.30', expenseDate: '2026-10-14' };
let adminPool, pool, server, baseUrl, owner, other, token, otherToken;
let schemaCreated = false;

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
    VALUES ('owner@example.invalid', 'test-only'), ('other@example.invalid', 'test-only') RETURNING id`);
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
    try { if (schemaCreated) await adminPool.query(`DROP SCHEMA ${schema} CASCADE`); }
    finally { await adminPool.end(); }
  }
});

async function request(path = '/expenses', { auth = token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method,
    headers: { ...(auth && { Authorization: `Bearer ${auth}` }), ...(body && { 'Content-Type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  return { status: response.status, cache: response.headers.get('Cache-Control'),
    body: response.status === 204 ? null : await response.json() };
}

async function create(body = valid, auth = token) { return request('/expenses', { method: 'POST', body, auth }); }
async function shift(userId = owner) {
  const { rows: [row] } = await pool.query(`INSERT INTO shifts (user_id, started_at, ended_at, status)
    VALUES ($1, '2026-10-01T10:00:00Z', '2026-10-01T12:00:00Z', 'completed') RETURNING id`, [userId]);
  return row.id;
}

test('expense CRUD preserves exact amounts, categories, dates and nullable fields', async () => {
  const empty = await request();
  assert.equal(empty.status, 200);
  assert.equal(empty.cache, 'no-store');
  assert.deepEqual(empty.body.expenses, []);
  for (const category of ['fuel', 'vehicle_service', 'vehicle_rental', 'phone', 'other']) {
    const saved = await create({ ...valid, category });
    assert.equal(saved.status, 201);
    assert.equal(saved.cache, 'no-store');
    assert.deepEqual(saved.body.expense, { ...valid, category, id: saved.body.expense.id, shiftId: null, note: null });
  }
  let expenses = (await request()).body.expenses;
  assert.equal(expenses.length, 5);
  const id = expenses[0].id;
  const saved = await request(`/expenses/${id}`, { method: 'PUT', body: { ...valid, amount: '0', note: ' note ' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.expense.amount, '0.00');
  assert.equal(saved.body.expense.note, 'note');
  assert.equal((await request(`/expenses/${id}`, { method: 'DELETE' })).status, 204);
  expenses = (await request()).body.expenses;
  assert.equal(expenses.length, 4);
  assert.equal((await request(`/expenses/${id}`, { method: 'DELETE' })).status, 404);
});

test('every expense endpoint enforces JWT and reads and mutations always use the token owner', async () => {
  const id = (await create()).body.expense.id;
  for (const [method, path] of [['GET', '/expenses'], ['POST', '/expenses'],
    ['PUT', `/expenses/${id}`], ['DELETE', `/expenses/${id}`]]) {
    for (const auth of [null, 'invalid']) {
      assert.equal((await request(path, { method, auth,
        ...(['POST', 'PUT'].includes(method) && { body: valid }),
      })).status, 401);
    }
  }
  assert.equal((await request(`/expenses?user_id=${owner}`, { auth: otherToken })).body.expenses.length, 0);
  assert.equal((await request(`/expenses/${id}`, { auth: otherToken, method: 'PUT', body: valid })).status, 404);
  assert.equal((await request(`/expenses/${id}`, { auth: otherToken, method: 'DELETE' })).status, 404);
  await create({ ...valid, user_id: other });
  assert.equal((await request('/expenses', { auth: otherToken })).body.expenses.length, 0);
  assert.equal((await request()).body.expenses.length, 2);
});

test('optional shift links require ownership, support relinking and survive shift deletion', async () => {
  const ownShift = await shift();
  const anotherShift = await shift();
  const foreignShift = await shift(other);
  for (const shiftId of [foreignShift, 2147483647]) assert.equal((await create({ ...valid, shiftId })).status, 404);
  const saved = await create({ ...valid, shiftId: ownShift });
  assert.equal(saved.body.expense.shiftId, ownShift);
  const id = saved.body.expense.id;
  assert.equal((await request(`/expenses/${id}`, { method: 'PUT', body: { ...valid, shiftId: foreignShift } })).status, 404);
  assert.equal((await request()).body.expenses[0].shiftId, ownShift);
  await request(`/expenses/${id}`, { method: 'PUT', body: { ...valid, shiftId: anotherShift } });
  assert.equal((await request()).body.expenses[0].shiftId, anotherShift);
  await request(`/expenses/${id}`, { method: 'PUT', body: { ...valid, shiftId: null } });
  assert.equal((await request()).body.expenses[0].shiftId, null);
  await request(`/expenses/${id}`, { method: 'PUT', body: { ...valid, shiftId: ownShift } });
  await request(`/shifts/${ownShift}`, { method: 'DELETE' });
  const remaining = (await request()).body.expenses[0];
  assert.equal(remaining.shiftId, null);
  assert.equal(remaining.amount, valid.amount);
});

test('invalid writes leave expenses unchanged and history filters validate date and category', async () => {
  const id = (await create()).body.expense.id;
  for (const body of [{ ...valid, amount: '-1' }, { ...valid, amount: '0.001' }, { ...valid, expenseDate: '2026-02-29' },
    { ...valid, category: 'unknown' }, { ...valid, shiftId: [] }, { ...valid, note: 123 }]) {
    assert.equal((await create(body)).status, 400);
    assert.equal((await request(`/expenses/${id}`, { method: 'PUT', body })).status, 400);
  }
  assert.equal((await request()).body.expenses.length, 1);
  assert.equal((await request()).body.expenses[0].amount, valid.amount);
  await create({ ...valid, category: 'phone', expenseDate: '2026-10-15' });
  await create({ ...valid, expenseDate: '2026-10-13' });
  assert.equal((await request('/expenses?from=2026-10-14&to=2026-10-14&category=fuel')).body.expenses.length, 1);
  assert.equal((await request('/expenses?category=phone')).body.expenses.length, 1);
  assert.equal((await request('/expenses?from=2026-10-16')).body.expenses.length, 0);
  assert.deepEqual((await request()).body.expenses.map((expense) => expense.expenseDate), ['2026-10-15', '2026-10-14', '2026-10-13']);
  for (const query of ['from=bad', 'from=2026-10-15&to=2026-10-14', 'category=bad', 'category=fuel&category=phone', 'to=2026-10-14&to=2026-10-15']) {
    assert.equal((await request(`/expenses?${query}`)).status, 400);
  }
  for (const method of ['PUT', 'DELETE']) {
    assert.equal((await request('/expenses/invalid', { method, ...(method === 'PUT' && { body: valid }) })).status, 400);
    assert.equal((await request('/expenses/2147483647', { method, ...(method === 'PUT' && { body: valid }) })).status, 404);
  }
});

test('summary sums costs by expense date once, independently of shifts and gross/net mode, and updates after changes', async () => {
  const cost = { ...valid, expenseDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' }) };
  const ownShift = await shift();
  await pool.query(`INSERT INTO shift_platform_entries (shift_id, platform, earnings_gross, orders_count)
    VALUES ($1, 'glovo', 100, 5), ($1, 'bolt_food', 100, 5)`, [ownShift]);
  const id = (await create({ ...cost, amount: '0.10', shiftId: ownShift })).body.expense.id;
  await create({ ...cost, amount: '0.20' });
  await create({ ...cost, amount: '999.00' }, otherToken);
  await create({ ...valid, expenseDate: '2099-01-01', amount: '999.00' });
  let summary = (await request('/analytics/summary')).body.summary;
  assert.equal(summary.totalExpenses, '0.30');
  assert.equal(summary.expenseCount, 2);
  assert.equal(summary.totalEarnings, '200.00');
  await request('/settings', { method: 'PUT', body: { netProfile: 'employed_under_26' } });
  const net = (await request('/analytics/summary?mode=estimated_net')).body.summary;
  assert.equal(net.totalExpenses, '0.30');
  assert.equal(net.totalEarnings, '182.00');
  await request(`/expenses/${id}`, { method: 'PUT', body: { ...cost, amount: '10', shiftId: ownShift } });
  assert.equal((await request('/analytics/summary')).body.summary.totalExpenses, '10.20');
  await request(`/shifts/${ownShift}`, { method: 'DELETE' });
  assert.equal((await request('/analytics/summary')).body.summary.totalExpenses, '10.20');
  await request(`/expenses/${id}`, { method: 'DELETE' });
  summary = (await request('/analytics/summary')).body.summary;
  assert.equal(summary.totalExpenses, '0.20');
  assert.equal(summary.expenseCount, 1);
});

test('expense summary uses Warsaw calendar date bounds for all four periods, including costs without shifts', async () => {
  const now = new Date('2026-10-14T22:30:00Z'); // October 15 in Warsaw.
  const service = createAnalyticsService(createAnalyticsRepository(pool), () => now);
  for (const expenseDate of ['2026-10-15', '2026-10-08', '2026-09-15', '2026-07-17', '2026-07-16', '2026-10-16']) {
    await create({ ...valid, expenseDate, amount: '1.00' });
  }
  for (const [period, count] of [['week', 2], ['month', 3], ['three_months', 4], ['all', 5]]) {
    const summary = await service.summary(owner, period);
    assert.equal(summary.expenseCount, count);
    assert.equal(summary.totalExpenses, `${count}.00`);
    assert.equal(summary.shiftCount, 0);
  }
});
