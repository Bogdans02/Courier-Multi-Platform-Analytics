const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'
).replace(/\/$/, '');

export async function getHealth(signal) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/health`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Nie można połączyć się z backendem. Sprawdź, czy serwer jest uruchomiony.', {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new Error(`Backend zwrócił błąd (HTTP ${response.status}).`);
  }

  let health;
  try {
    health = await response.json();
  } catch {
    throw new Error('Backend zwrócił nieprawidłową odpowiedź.');
  }

  if (health?.status !== 'ok') {
    throw new Error('Backend nie potwierdził poprawnego działania.');
  }

  return health;
}
