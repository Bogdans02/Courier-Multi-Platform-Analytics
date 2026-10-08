import pg from 'pg';
import './env.js';

export function createDatabasePool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString?.trim()) {
    throw new Error('DATABASE_URL is required. Configure backend/.env.');
  }

  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
  });

  // Never log the connection string, which may include a password.
  pool.on('error', () => {
    console.error('An idle PostgreSQL connection failed.');
  });

  return pool;
}
