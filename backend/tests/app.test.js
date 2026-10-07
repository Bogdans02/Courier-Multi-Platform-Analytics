import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import app from '../src/app.js';
import { frontendOrigin } from '../src/config/env.js';

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));

test('health endpoint returns the expected JSON and local CORS header', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: frontendOrigin },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), frontendOrigin);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('unknown routes return a JSON 404', async () => {
  const response = await fetch(`${baseUrl}/api/missing`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: 'Route not found.' });
});

test('invalid JSON is handled by the centralized error middleware', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Invalid JSON body.' });
});
