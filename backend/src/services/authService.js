import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validateCredentials } from '../validators/authValidator.js';
import { httpError } from '../utils/httpError.js';

export function createAuthService(users, jwtSecret) {
  return {
    async register(body) {
      const { email, password } = validateCredentials(body);
      const passwordHash = await bcrypt.hash(password, 12);
      try {
        return await users.create(email, passwordHash);
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'users_email_unique') {
          throw httpError(409, 'Konto z tym adresem e-mail już istnieje.');
        }
        throw error;
      }
    },
    async login(body) {
      const { email, password } = validateCredentials(body);
      const user = await users.findByEmail(email);
      if (!user || !await bcrypt.compare(password, user.password_hash)) {
        throw httpError(401, 'Niepoprawny e-mail lub hasło.');
      }
      const token = jwt.sign({}, jwtSecret, {
        algorithm: 'HS256', subject: String(user.id), expiresIn: '1h',
      });
      return { token, user: { id: user.id, email: user.email } };
    },
  };
}
