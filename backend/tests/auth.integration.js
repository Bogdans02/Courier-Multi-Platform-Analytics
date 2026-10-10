import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { createDatabasePool } from '../src/config/database.js';
import { runMigrations } from '../src/db/migrate.js';

const schema = `auth_test_${randomUUID().replaceAll('-', '')}`;
const secret = randomBytes(32).toString('hex');
const credentials = { email: 'Courier@Example.com', password: 'Test-password-123' };
let adminPool;
let pool;
let schemaCreated = false;
let server;
let baseUrl;
let firstUser;
let firstToken;

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
  server = createApp(pool, secret).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (pool) await pool.end();
  if (adminPool) {
    try {
      // Remove only the randomly named schema created by this test.
      if (schemaCreated) await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally {
      await adminPool.end();
    }
  }
});

async function post(path, body) {
  const response = await fetch(`${baseUrl}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('registration stores a salted hash and creates empty settings atomically', async () => {
  const result = await post('register', credentials);
  assert.equal(result.status, 201);
  firstUser = result.body.user;
  assert.deepEqual(Object.keys(firstUser).sort(), ['email', 'id']);
  assert.equal(firstUser.email, 'courier@example.com');
  const { rows: [row] } = await pool.query(`
    SELECT password_hash, net_profile, deduction_rate
    FROM users JOIN user_settings ON users.id = user_settings.user_id WHERE users.id = $1
  `, [firstUser.id]);
  assert.notEqual(row.password_hash, credentials.password);
  assert.equal(await bcrypt.compare(credentials.password, row.password_hash), true);
  assert.equal(bcrypt.getRounds(row.password_hash), 12);
  assert.equal(row.net_profile, null);
  assert.equal(row.deduction_rate, null);
});

test('duplicate email ignores case and whitespace and leaves only one account', async () => {
  const result = await post('register', { ...credentials, email: ' COURIER@example.com ' });
  assert.equal(result.status, 409);
  assert.match(result.body.message, /już istnieje/);
  const { rows: [row] } = await pool.query('SELECT COUNT(*)::integer AS count FROM users');
  assert.equal(row.count, 1);
});

test('both endpoints reject invalid credentials before accessing data', async () => {
  for (const path of ['register', 'login']) {
    for (const body of [{}, { ...credentials, email: 'invalid' },
      { ...credentials, password: 'short' }, { ...credentials, password: 'ą'.repeat(37) }]) {
      assert.equal((await post(path, body)).status, 400);
    }
  }
});

test('login returns a signed expiring JWT and never returns the password hash', async () => {
  const result = await post('login', { ...credentials, email: ' COURIER@example.com ' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.user, firstUser);
  firstToken = result.body.token;
  const payload = jwt.verify(firstToken, secret, { algorithms: ['HS256'] });
  assert.equal(payload.sub, String(firstUser.id));
  assert.equal(payload.exp - payload.iat, 3600);
  assert.deepEqual(Object.keys(result.body).sort(), ['token', 'user']);
});

test('wrong password and unknown email give the same 401 response', async () => {
  const wrongPassword = await post('login', { ...credentials, password: 'wrong-password' });
  const unknownEmail = await post('login', { ...credentials, email: 'unknown@example.com' });
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(wrongPassword, unknownEmail);
});

test('me returns only the token owner, ignoring supplied user_id', async () => {
  const secondCredentials = { email: 'second@example.com', password: 'Second-password-123' };
  const second = await post('register', secondCredentials);
  const secondLogin = await post('login', secondCredentials);
  for (const [token, user, other] of [
    [firstToken, firstUser, second.body.user], [secondLogin.body.token, second.body.user, firstUser],
  ]) {
    const response = await fetch(`${baseUrl}/me?user_id=${other.id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { user });
  }
});

test('me rejects missing, malformed, forged and expired tokens', async () => {
  const tokens = [null, 'invalid', firstToken.slice(0, -5) + 'abcde',
    jwt.sign({}, 'different-test-secret', { subject: String(firstUser.id), expiresIn: '1h' }),
    jwt.sign({}, secret, { subject: String(firstUser.id), expiresIn: -1 }),
    jwt.sign({}, secret, { subject: String(firstUser.id), algorithm: 'HS384', expiresIn: '1h' }),
    jwt.sign({}, secret, { subject: 'invalid-id', expiresIn: '1h' }),
    jwt.sign({}, secret, { subject: String(firstUser.id) }),
  ];
  for (const token of tokens) {
    const response = await fetch(`${baseUrl}/me`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(response.status, 401);
    assert.deepEqual(Object.keys(await response.json()), ['message']);
  }
});

test('a valid token cannot access a deleted account', async () => {
  const created = await post('register', { email: 'deleted@example.com', password: 'Deleted-password-123' });
  const loggedIn = await post('login', { email: 'deleted@example.com', password: 'Deleted-password-123' });
  await pool.query('DELETE FROM users WHERE id = $1', [created.body.user.id]);
  const response = await fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${loggedIn.body.token}` } });
  assert.equal(response.status, 401);
});
