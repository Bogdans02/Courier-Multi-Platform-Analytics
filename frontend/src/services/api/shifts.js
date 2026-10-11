const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3000/api'
).replace(/\/$/, '');

async function request(path, token, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/shifts${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Nie można połączyć się z serwerem. Spróbuj ponownie.', { cause: error });
  }
  if (response.status === 204) return;
  let data;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error('Serwer zwrócił nieprawidłową odpowiedź.'), { status: response.status });
  }
  if (!response.ok) {
    throw Object.assign(new Error(data.message || 'Nie udało się wykonać żądania.'), { status: response.status });
  }
  return data;
}

export const getActiveShift = (token, signal) => request('/active', token, { signal });
export const getShifts = (token, signal) => request('', token, { signal });
export const getShift = (token, id, signal) => request(`/${id}`, token, { signal });
export const startShift = (token) => request('/start', token, { method: 'POST' });
export const finishShift = (token, id) => request(`/${id}/finish`, token, { method: 'POST' });
export const updateShift = (token, id, body) => request(`/${id}`, token, { method: 'PUT', body });
export const deleteShift = (token, id) => request(`/${id}`, token, { method: 'DELETE' });
