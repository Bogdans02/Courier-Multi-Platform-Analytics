import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { createDatabasePool } from '../src/config/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { checkDatabase } from '../src/db/checkDatabase.js';

const schema = `stage2_test_${randomUUID().replaceAll('-', '')}`;
let adminPool;
let pool;
let schemaCreated = false;

before(async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'Set TEST_DATABASE_URL to a dedicated PostgreSQL test database.');
  adminPool = createDatabasePool(connectionString);
  await adminPool.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;

  const url = new URL(connectionString);
  url.searchParams.set('options', `-c search_path=${schema}`);
  pool = createDatabasePool(url.toString());

  assert.deepEqual(await runMigrations(pool), ['001_initial_schema.sql']);
});

after(async () => {
  if (pool) await pool.end();
  if (adminPool) {
    try {
      // Only the randomly named schema created by this test is removed.
      if (schemaCreated) await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally {
      await adminPool.end();
    }
  }
});

async function withFixture(check) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [user] } = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [`${randomUUID()}@example.invalid`, 'test-only-hash-no-login'],
    );
    const { rows: [shift] } = await client.query(`
      INSERT INTO shifts (user_id, status, started_at, ended_at)
      VALUES ($1, 'completed', '2026-10-01T16:00:00Z', '2026-10-01T22:00:00Z')
      RETURNING *
    `, [user.id]);
    await check(client, user, shift);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}

test('migrations are repeatable and create all five business tables', async () => {
  assert.deepEqual(await runMigrations(pool), []);
  const { rows } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = $1 ORDER BY table_name
  `, [schema]);
  assert.deepEqual(rows.map((row) => row.table_name), [
    'expenses', 'schema_migrations', 'shift_platform_entries', 'shifts', 'user_settings', 'users',
  ]);
});

test('failed migrations roll back DDL and migration history together', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'courier-migrations-'));
  try {
    await writeFile(join(directory, '002_broken.sql'), `
      CREATE TABLE migration_probe (id INTEGER);
      SELECT * FROM missing_migration_table;
    `);
    await assert.rejects(runMigrations(pool, pathToFileURL(directory + sep)), { code: '42P01' });
    const { rows: [row] } = await pool.query(`
      SELECT to_regclass('migration_probe') AS probe,
        (SELECT COUNT(*)::integer FROM schema_migrations) AS migrations_count
    `);
    assert.equal(row.probe, null);
    assert.equal(row.migrations_count, 1);
  } finally {
    await rm(join(directory, '002_broken.sql'), { force: true });
    await rmdir(directory);
  }
});

test('backend diagnostic writes and reads all tables without leaving records', async () => {
  const { rows: [beforeCheck] } = await pool.query('SELECT COUNT(*)::integer AS count FROM users');
  assert.deepEqual(await checkDatabase(pool), { earningsGross: '235.00', ordersCount: 14 });
  const { rows: [afterCheck] } = await pool.query('SELECT COUNT(*)::integer AS count FROM users');
  assert.equal(afterCheck.count, beforeCheck.count);
});

test('email uniqueness ignores letter case', async () => {
  await withFixture(async (client, user) => {
    await assert.rejects(client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      [user.email.toUpperCase(), 'test-only-hash-no-login'],
    ), { code: '23505' });
  });
});

test('multiple platform entries retain exact money and integer order counts', async () => {
  await withFixture(async (client, _user, shift) => {
    assert.equal(shift.distance_km, null);
    assert.equal(shift.distance_source, null);
    await client.query(`
      INSERT INTO shift_platform_entries (shift_id, platform, earnings_gross, orders_count)
      VALUES ($1, 'glovo', 160.10, 10), ($1, 'bolt_food', 75.20, 4)
    `, [shift.id]);
    const { rows: [row] } = await client.query(`
      SELECT SUM(earnings_gross) AS earnings, SUM(orders_count)::integer AS orders
      FROM shift_platform_entries WHERE shift_id = $1
    `, [shift.id]);
    assert.deepEqual(row, { earnings: '235.30', orders: 14 });
  });
});

test('a platform cannot appear twice in a shift', async () => {
  await withFixture(async (client, _user, shift) => {
    const sql = `INSERT INTO shift_platform_entries (shift_id, platform, earnings_gross, orders_count)
      VALUES ($1, 'glovo', 0, 0)`;
    await client.query(sql, [shift.id]);
    await assert.rejects(client.query(sql, [shift.id]), { code: '23505' });
  });
});

test('only one active shift is allowed per user', async () => {
  await withFixture(async (client, user) => {
    const sql = 'INSERT INTO shifts (user_id, started_at) VALUES ($1, CURRENT_TIMESTAMP)';
    await client.query(sql, [user.id]);
    await assert.rejects(client.query(sql, [user.id]), { code: '23505' });
  });
});

const invalidShifts = [
  ['negative distance', 'distance_km = -1, distance_source = \'manual\''],
  ['distance without source', 'distance_km = 1, distance_source = NULL'],
  ['end before start', 'ended_at = started_at - interval \'1 hour\''],
];

for (const [name, assignment] of invalidShifts) {
  test(`shift constraint rejects ${name}`, async () => {
    await withFixture(async (client, _user, shift) => {
      await assert.rejects(client.query(`UPDATE shifts SET ${assignment} WHERE id = $1`, [shift.id]), {
        code: '23514',
      });
    });
  });
}

test('manual, GPS and zero distance can be stored in the common distance model', async () => {
  await withFixture(async (client, _user, shift) => {
    for (const [distance, source] of [['64.50', 'manual'], ['12.34', 'gps'], ['0.00', 'manual']]) {
      const { rows: [row] } = await client.query(`
        UPDATE shifts SET distance_km = $1, distance_source = $2
        WHERE id = $3 RETURNING distance_km, distance_source
      `, [distance, source, shift.id]);
      assert.deepEqual(row, { distance_km: distance, distance_source: source });
    }
  });
});

for (const [name, platform, earnings, orders, code] of [
  ['negative earnings', 'glovo', '-1', '0', '23514'],
  ['negative orders', 'glovo', '0', '-1', '23514'],
  ['fractional order input', 'glovo', '0', '1.5', '22P02'],
  ['unknown platform', 'unknown', '0', '0', '23514'],
]) {
  test(`platform constraint rejects ${name}`, async () => {
    await withFixture(async (client, _user, shift) => {
      await assert.rejects(client.query(`
        INSERT INTO shift_platform_entries (shift_id, platform, earnings_gross, orders_count)
        VALUES ($1, $2, $3, $4)
      `, [shift.id, platform, earnings, orders]), { code });
    });
  });
}

test('foreign keys reject resources pointing at missing users and shifts', async () => {
  await assert.rejects(pool.query(
    'INSERT INTO shifts (user_id, started_at) VALUES (-1, CURRENT_TIMESTAMP)',
  ), { code: '23503' });
  await assert.rejects(pool.query(`
    INSERT INTO shift_platform_entries (shift_id, platform, earnings_gross, orders_count)
    VALUES (-1, 'glovo', 0, 0)
  `), { code: '23503' });
});

test('an expense cannot reference another user\'s shift', async () => {
  await withFixture(async (client, _user, shift) => {
    const { rows: [other] } = await client.query(`
      INSERT INTO users (email, password_hash) VALUES ($1, 'test-only-hash-no-login') RETURNING id
    `, [`${randomUUID()}@example.invalid`]);
    await assert.rejects(client.query(`
      INSERT INTO expenses (user_id, shift_id, category, amount, expense_date)
      VALUES ($1, $2, 'fuel', 10, '2026-10-01')
    `, [other.id, shift.id]), { code: '23503' });
  });
});

test('deleting a shift deletes its entries but preserves expenses without the link', async () => {
  await withFixture(async (client, user, shift) => {
    await client.query(`
      INSERT INTO shift_platform_entries (shift_id, platform, earnings_gross, orders_count)
      VALUES ($1, 'glovo', 0, 0)
    `, [shift.id]);
    await client.query(`
      INSERT INTO expenses (user_id, shift_id, category, amount, expense_date)
      VALUES ($1, $2, 'fuel', 10, '2026-10-01')
    `, [user.id, shift.id]);
    await client.query('DELETE FROM shifts WHERE id = $1', [shift.id]);
    const { rows: [expense] } = await client.query(
      'SELECT user_id, shift_id, amount FROM expenses WHERE user_id = $1', [user.id],
    );
    assert.deepEqual(expense, { user_id: user.id, shift_id: null, amount: '10.00' });
    const { rows } = await client.query('SELECT id FROM shift_platform_entries WHERE shift_id = $1', [shift.id]);
    assert.equal(rows.length, 0);
  });
});

for (const [name, category, amount, date, code] of [
  ['negative amount', 'fuel', '-1', '2026-10-01', '23514'],
  ['empty category', '  ', '0', '2026-10-01', '23514'],
]) {
  test(`expense constraint rejects ${name}`, async () => {
    await withFixture(async (client, user) => {
      await assert.rejects(client.query(`
        INSERT INTO expenses (user_id, category, amount, expense_date) VALUES ($1, $2, $3, $4)
      `, [user.id, category, amount, date]), { code });
    });
  });
}

test('settings have no assumed profile or rate and allow only one row per user', async () => {
  await withFixture(async (client, user) => {
    const { rows: [settings] } = await client.query(`
      INSERT INTO user_settings (user_id) VALUES ($1) RETURNING net_profile, deduction_rate
    `, [user.id]);
    assert.deepEqual(settings, { net_profile: null, deduction_rate: null });
    await assert.rejects(client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [user.id]), {
      code: '23505',
    });
  });
});

test('settings reject a deduction rate outside the allowed range', async () => {
  await withFixture(async (client, user) => {
    await assert.rejects(client.query(
      'INSERT INTO user_settings (user_id, deduction_rate) VALUES ($1, $2)', [user.id, '1.01'],
    ), { code: '23514' });
  });
});
