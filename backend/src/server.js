import { createApp } from './app.js';
import { port, getJwtSecret } from './config/env.js';
import { createDatabasePool } from './config/database.js';
import { runMigrations } from './db/migrate.js';

let pool;

try {
  const jwtSecret = getJwtSecret();
  pool = createDatabasePool();
  await pool.query('SELECT 1');

  const applied = await runMigrations(pool);
  console.log(applied.length ? `Migrations applied: ${applied.join(', ')}` : 'No pending migrations.');

  const server = createApp(pool, jwtSecret).listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
  });

  server.on('error', async () => {
    console.error('Backend could not listen on the configured port.');
    await pool.end();
    process.exitCode = 1;
  });

} catch {
  console.error('Backend startup failed. Check JWT_SECRET, DATABASE_URL and PostgreSQL availability.');
  if (pool) await pool.end();
  process.exitCode = 1;
}
