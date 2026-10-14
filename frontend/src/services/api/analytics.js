const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3000/api'
).replace(/\/$/, '');

export async function getSummary(token, period, signal, mode = 'gross') {
  return requestAnalytics(token, `summary?period=${encodeURIComponent(period)}${modeQuery(mode)}`, signal);
}

export async function getDetails(token, period, platform, signal, mode = 'gross') {
  return requestAnalytics(token,
    `details?period=${encodeURIComponent(period)}&platform=${encodeURIComponent(platform)}${modeQuery(mode)}`, signal);
}

const modeQuery = (mode) => mode === 'gross' ? '' : `&mode=${encodeURIComponent(mode)}`;

async function requestAnalytics(token, path, signal) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/analytics/${path}`, {
      headers: { Authorization: `Bearer ${token}` }, signal,
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
    throw Object.assign(new Error(data.message || 'Nie udało się pobrać statystyk.'), { status: response.status });
  }
  return data;
}
