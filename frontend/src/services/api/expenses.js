const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3000/api'
).replace(/\/$/, '');

async function request(path, token, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/expenses${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }), signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Nie można połączyć się z serwerem. Spróbuj ponownie.', { cause: error });
  }
  if (response.status === 204) return;
  let data;
  try { data = await response.json(); }
  catch { throw Object.assign(new Error('Serwer zwrócił nieprawidłową odpowiedź.'), { status: response.status }); }
  if (!response.ok) {
    throw Object.assign(new Error(data.message || 'Nie udało się wykonać operacji na kosztach.'), { status: response.status });
  }
  return data;
}

export function getExpenses(token, filters = {}, signal) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ''));
  return request(query.size ? `?${query}` : '', token, { signal });
}
export const createExpense = (token, body) => request('', token, { method: 'POST', body });
export const updateExpense = (token, id, body) => request(`/${id}`, token, { method: 'PUT', body });
export const deleteExpense = (token, id) => request(`/${id}`, token, { method: 'DELETE' });
