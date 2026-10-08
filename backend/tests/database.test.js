import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabasePool } from '../src/config/database.js';

test('database configuration requires an explicit connection string', () => {
  assert.throws(() => createDatabasePool(''), /DATABASE_URL is required/);
  assert.throws(() => createDatabasePool('  '), /DATABASE_URL is required/);
});
