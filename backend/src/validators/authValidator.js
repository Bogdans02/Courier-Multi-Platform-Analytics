import { httpError } from '../utils/httpError.js';

export function validateCredentials(body) {
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
    throw httpError(400, 'Podaj adres e-mail i hasło.');
  }
  const email = body.email.trim().toLowerCase();
  const password = body.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, 'Podaj poprawny adres e-mail.');
  }
  if (password.length < 8 || !password.trim()) {
    throw httpError(400, 'Hasło musi mieć co najmniej 8 znaków i nie może składać się z samych spacji.');
  }
  // bcrypt accepts at most 72 UTF-8 bytes; reject longer input instead of truncating it.
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw httpError(400, 'Hasło jest zbyt długie. Użyj krótszego hasła.');
  }
  return { email, password };
}
