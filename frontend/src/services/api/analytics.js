const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3000/api'
).replace(/\/$/, '');

export async function getSummary(token, selection, signal, mode = 'gross') {
  return requestAnalytics(token, `summary?${analyticsQuery(selection, mode)}`, signal);
}

export async function getDetails(token, selection, platform, signal, mode = 'gross', eventPlatform) {
  return requestAnalytics(token,
    `details?${analyticsQuery(selection, mode, platform, eventPlatform)}`, signal);
}

function analyticsQuery(selection, mode, platform, eventPlatform) {
  const query = new URLSearchParams();
  if (typeof selection === 'string') query.set('period', selection);
  else {
    query.set('calendar', selection.calendar);
    if (selection.calendar !== 'all') query.set('anchor', selection.anchor);
    if (selection.asOf) query.set('asOf', selection.asOf);
  }
  if (platform !== undefined) query.set('platform', platform);
  if (eventPlatform !== undefined) query.set('eventPlatform', eventPlatform);
  if (mode !== 'gross') query.set('mode', mode);
  return query.toString();
}

async function requestAnalytics(token, path, signal) {
  signal?.throwIfAborted();
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
  signal?.throwIfAborted();
  if (!response.ok) {
    throw Object.assign(new Error(data.message || 'Nie udało się pobrać statystyk.'), { status: response.status });
  }
  return data;
}
