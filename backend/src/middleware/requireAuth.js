import jwt from 'jsonwebtoken';
import { httpError } from '../utils/httpError.js';

export function requireAuth(users, jwtSecret) {
  return async (req, _res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '');
    if (!match) throw httpError(401, 'Zaloguj się, aby uzyskać dostęp.');

    let payload;
    try {
      payload = jwt.verify(match[1], jwtSecret, { algorithms: ['HS256'] });
    } catch {
      throw httpError(401, 'Sesja wygasła lub token jest niepoprawny. Zaloguj się ponownie.');
    }
    // Only a verified token identifies the user; body/query user_id is never trusted.
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647 || !Number.isInteger(payload.exp)) {
      throw httpError(401, 'Niepoprawny token.');
    }
    const user = await users.findById(id);
    if (!user) throw httpError(401, 'Konto nie istnieje. Zaloguj się ponownie.');
    req.user = user;
    next();
  };
}
