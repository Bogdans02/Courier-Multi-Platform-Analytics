const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3000/api'
).replace(/\/$/, '');

async function request(path, { credentials, token, signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/${path}`, {
      method: credentials ? 'POST' : 'GET',
      headers: {
        ...(credentials && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...(credentials && { body: JSON.stringify(credentials) }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Nie można połączyć się z serwerem. Spróbuj ponownie.', { cause: error });
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error('Serwer zwrócił nieprawidłową odpowiedź.'), { status: response.status });
  }
  if (!response.ok) {
    throw Object.assign(new Error(data.message || 'Nie udało się wykonać żądania.'), { status: response.status });
  }
  if (!data.user || !Number.isInteger(data.user.id) || typeof data.user.email !== 'string'
    || (path === 'login' && typeof data.token !== 'string')) {
    throw new Error('Serwer zwrócił nieprawidłową odpowiedź.');
  }
  return data;
}

export const register = (credentials) => request('register', { credentials });
export const login = (credentials) => request('login', { credentials });
export const getCurrentUser = (token, signal) => request('me', { token, signal });
