import 'dotenv/config';

export const port = Number(process.env.PORT || 3000);
export const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
