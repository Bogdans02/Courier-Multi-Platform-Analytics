import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getJwtSecret } from '../src/config/env.js';
import { validateCredentials } from '../src/validators/authValidator.js';

test('JWT configuration rejects a missing or short secret without exposing it', () => {
  for (const value of ['', 'short', ' '.repeat(32)]) {
    assert.throws(() => getJwtSecret(value), /JWT_SECRET must contain/);
  }
  assert.equal(getJwtSecret('test-only-secret-with-at-least-32-characters'), 'test-only-secret-with-at-least-32-characters');
});

test('credentials normalize email, preserve password and reject invalid input', () => {
  assert.deepEqual(validateCredentials({ email: ' Courier@Example.com ', password: ' password ' }), {
    email: 'courier@example.com', password: ' password ',
  });
  for (const body of [null, {}, { email: 123, password: 'password' },
    { email: 'invalid', password: 'password' }, { email: 'a@example.com', password: 'short' },
    { email: 'a@example.com', password: ' '.repeat(8) },
    { email: 'a@example.com', password: 'ą'.repeat(37) }]) {
    assert.throws(() => validateCredentials(body), { status: 400 });
  }
  assert.throws(() => validateCredentials({ email: 'a@example.com', password: 'short' }), {
    status: 400, message: 'Hasło musi mieć co najmniej 8 znaków i nie może składać się z samych spacji.',
  });
  assert.throws(() => validateCredentials({ email: 'a@example.com', password: 'ą'.repeat(37) }), {
    status: 400, message: 'Hasło jest zbyt długie. Użyj krótszego hasła.',
  });
});
