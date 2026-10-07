const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'
).replace(/\/$/, '');

export async function getJson(path, signal) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Nie można połączyć się z backendem. Sprawdź, czy serwer jest uruchomiony.', {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new Error(`Backend zwrócił błąd (HTTP ${response.status}).`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error('Backend zwrócił nieprawidłową odpowiedź.');
  }
}
