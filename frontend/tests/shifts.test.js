import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deleteShift, finishShift, getActiveShift, getShift, getShifts, startShift, updateShift } from '../src/services/api/shifts.js';
import { shiftFormPayload, validateShiftForm } from '../src/utils/shiftValidation.js';
import { formatDistance, formatDuration, toLocalDateTime } from '../src/utils/shiftFormat.js';

const valid = { startedAt: '2026-10-10T08:00:00.123', endedAt: '2026-10-10T10:30:00.456', distanceKm: '' };

test('shift form validates time order and distance and converts local dates to UTC without losing milliseconds', () => {
  assert.equal(validateShiftForm(valid), '');
  assert.equal(shiftFormPayload(valid).distanceKm, null);
  assert.equal(shiftFormPayload({ ...valid, distanceKm: '0' }).distanceKm, '0');
  assert.equal(shiftFormPayload({ ...valid, distanceKm: '64.50' }).distanceKm, '64.50');
  for (const values of [{ ...valid, startedAt: '' }, { ...valid, endedAt: valid.startedAt },
    ...['-1', 'abc', '1.234', '100000000'].map((distanceKm) => ({ ...valid, distanceKm }))]) {
    assert.notEqual(validateShiftForm(values), '');
  }
  const utc = '2026-10-10T08:00:00.123Z';
  assert.equal(new Date(toLocalDateTime(utc)).toISOString(), utc);
  assert.equal(formatDuration(9001), '2 godz. 30 min 1 s');
  assert.equal(formatDistance(null), 'Nie podano');
  assert.equal(formatDistance('0.00'), '0 km');
});

test('shift API sends Bearer tokens, lifecycle methods and edit payloads and handles empty delete responses', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return options.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response('{}', { status: 200 });
  });
  const body = shiftFormPayload(valid);
  await startShift('test-token');
  await finishShift('test-token', 42);
  await getActiveShift('test-token');
  await getShifts('test-token');
  await getShift('test-token', 42);
  await updateShift('test-token', 42, body);
  assert.equal(await deleteShift('test-token', 42), undefined);
  assert.deepEqual(requests.map(({ options }) => options.method), ['POST', 'POST', 'GET', 'GET', 'GET', 'PUT', 'DELETE']);
  assert.match(requests[0].url, /\/shifts\/start$/);
  assert.match(requests[1].url, /\/shifts\/42\/finish$/);
  assert.match(requests[2].url, /\/shifts\/active$/);
  assert.equal(requests[0].options.body, undefined);
  assert.deepEqual(JSON.parse(requests[5].options.body), body);
  for (const { options } of requests) assert.equal(options.headers.Authorization, 'Bearer test-token');
});

test('shift API preserves validation and expired session errors and reports connectivity failures', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch');
  for (const status of [400, 401, 404, 409]) {
    mock.mock.mockImplementation(async () => new Response(JSON.stringify({ message: 'Czytelny błąd.' }), { status }));
    await assert.rejects(getShifts('token'), { status, message: 'Czytelny błąd.' });
  }
  mock.mock.mockImplementation(async () => { throw new TypeError('network failure'); });
  await assert.rejects(getShifts('token'), /Nie można połączyć/);
  mock.mock.mockImplementation(async () => new Response('invalid JSON', { status: 200 }));
  await assert.rejects(getShifts('token'), /nieprawidłową odpowiedź/);
  const controller = new AbortController();
  controller.abort();
  mock.mock.mockImplementation(async () => { throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(getShifts('token', controller.signal), { name: 'AbortError' });
});
