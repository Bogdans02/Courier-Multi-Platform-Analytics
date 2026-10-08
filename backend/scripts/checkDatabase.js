import { createDatabasePool } from '../src/config/database.js';
import { checkDatabase } from '../src/db/checkDatabase.js';

let pool;

try {
  pool = createDatabasePool();
  const result = await checkDatabase(pool);
  console.log(`PostgreSQL write/read OK: ${result.earningsGross} PLN, ${result.ordersCount} orders.`);
  console.log('Diagnostic records rolled back. Identity sequences may advance.');
} catch {
  console.error('Database check failed. Check DATABASE_URL and run npm run db:migrate first.');
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
