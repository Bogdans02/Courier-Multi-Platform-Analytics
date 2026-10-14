const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3000/api'
).replace(/\/$/, '');

async function request(token, { body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/settings`, {
      method: body ? 'PUT' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }), signal,
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
    throw Object.assign(new Error(data.message || 'Nie udało się odczytać lub zapisać ustawień.'), { status: response.status });
  }
  return data;
}

export const getSettings = (token, signal) => request(token, { signal });
export const saveSettings = (token, body) => request(token, { body });
