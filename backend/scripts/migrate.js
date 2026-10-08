import { createDatabasePool } from '../src/config/database.js';
import { runMigrations } from '../src/db/migrate.js';

let pool;

try {
  pool = createDatabasePool();
  const applied = await runMigrations(pool);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations.');
} catch {
  console.error('Migrations failed. Check DATABASE_URL, database availability and migration SQL.');
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
