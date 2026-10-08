import app from './app.js';
import { port } from './config/env.js';
import { createDatabasePool } from './config/database.js';

let pool;

try {
  pool = createDatabasePool();
  await pool.query('SELECT 1');

  const server = app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
  });

  server.on('error', async () => {
    console.error('Backend could not listen on the configured port.');
    await pool.end();
    process.exitCode = 1;
  });

} catch {
  console.error('Backend startup failed. Check DATABASE_URL and PostgreSQL availability.');
  if (pool) await pool.end();
  process.exitCode = 1;
}
