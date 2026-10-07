import { getJson } from './client.js';

export async function getHealth(signal) {
  const health = await getJson('/health', signal);

  if (health?.status !== 'ok') {
    throw new Error('Backend nie potwierdził poprawnego działania.');
  }

  return health;
}
