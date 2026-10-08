import { readdir, readFile } from 'node:fs/promises';

const migrationsDirectory = new URL('../../migrations/', import.meta.url);

export async function runMigrations(pool, directory = migrationsDirectory) {
  const filenames = (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));
    const newlyApplied = [];

    for (const name of filenames) {
      if (applied.has(name)) continue;

      const sql = await readFile(new URL(name, directory), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      newlyApplied.push(name);
    }

    await client.query('COMMIT');
    return newlyApplied;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
