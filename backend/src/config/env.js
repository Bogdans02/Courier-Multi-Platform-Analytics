import 'dotenv/config';

export const port = Number(process.env.PORT || 3000);
export const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

export function getJwtSecret(value = process.env.JWT_SECRET) {
  if (!value || Buffer.byteLength(value, 'utf8') < 32 || value.trim().length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters. Configure backend/.env.');
  }
  return value;
}
