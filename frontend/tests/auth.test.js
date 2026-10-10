import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCredentials } from '../src/utils/authValidation.js';
import { login, register, getCurrentUser } from '../src/services/api/auth.js';

test('client validation checks email and UTF-8 password length', () => {
  assert.equal(validateCredentials(' courier@example.com ', 'Password123'), '');
  assert.notEqual(validateCredentials('invalid', 'Password123'), '');
  assert.equal(validateCredentials('a@example.com', 'short'), 'Hasło musi mieć co najmniej 8 znaków i nie może składać się z samych spacji.');
  assert.equal(validateCredentials('a@example.com', 'ą'.repeat(37)), 'Hasło jest zbyt długie. Użyj krótszego hasła.');
  assert.equal(validateCredentials('a@example.com', 'ą'.repeat(36)), '');
});

test('auth API sends credentials and Bearer token without accepting user IDs', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ user: { id: 1, email: 'a@example.com' }, token: 'test-token' }), { status: 200 });
  });
  const credentials = { email: 'a@example.com', password: 'Password123' };
  await register(credentials);
  assert.equal((await login(credentials)).token, 'test-token');
  await getCurrentUser('test-token');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), credentials);
  assert.match(requests[1].url, /\/auth\/login$/);
  assert.equal(requests[2].options.method, 'GET');
  assert.deepEqual(requests[2].options.headers, { Authorization: 'Bearer test-token' });
  assert.equal(requests[2].options.body, undefined);
});

test('auth API preserves server errors, session status and connection failures', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch');
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ message: 'Sesja wygasła.' }), { status: 401 }));
  await assert.rejects(getCurrentUser('expired'), { status: 401, message: 'Sesja wygasła.' });
  fetchMock.mock.mockImplementation(async () => new Response('invalid JSON', { status: 200 }));
  await assert.rejects(login({}), /nieprawidłową odpowiedź/);
  fetchMock.mock.mockImplementation(async () => { throw new TypeError('network failure'); });
  await assert.rejects(login({}), /Nie można połączyć/);
  const controller = new AbortController();
  controller.abort();
  const aborted = new DOMException('Aborted', 'AbortError');
  fetchMock.mock.mockImplementation(async () => { throw aborted; });
  await assert.rejects(getCurrentUser('token', controller.signal), { name: 'AbortError' });
});
