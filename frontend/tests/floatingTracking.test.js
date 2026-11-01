import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFloatingTracking, deleteShiftWithDraft, floatingTracking, sessionExpiry } from '../src/services/floatingTracking.js';
import { entriesFromOrderEvents, withOrderEvents } from '../src/utils/orderEvents.js';

test('successful shift DELETE clears only its account-bound draft before finishing', async (t) => {
  const calls = [];
  const drafts = new Map([['7:12', ['recorded click']], ['7:13', ['another shift']], ['8:12', ['another account']]]);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /\/shifts\/12$/);
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.Authorization, 'Bearer token');
    calls.push('delete');
    return new Response(null, { status: 204 });
  });
  t.mock.method(floatingTracking, 'clearTrackingDraft', async (userId, shiftId) => {
    calls.push('clear');
    await new Promise((resolve) => setTimeout(resolve, 0));
    drafts.delete(`${userId}:${shiftId}`);
  });
  await deleteShiftWithDraft({ token: 'token', user: { id: 7 } }, 12);
  calls.push('finished');
  assert.deepEqual(calls, ['delete', 'clear', 'finished']);
  assert.deepEqual([...drafts.keys()], ['7:13', '8:12']);
});

test('failed shift DELETE preserves the draft and the existing API error', async (t) => {
  const draft = [{ platform: 'glovo', clickedAt: '2026-11-01T10:00:00.000Z' }];
  const drafts = new Map([['7:12', draft]]);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ message: 'Nie udało się usunąć zmiany.' }), { status: 500 }));
  const clear = t.mock.method(floatingTracking, 'clearTrackingDraft', async (userId, shiftId) => {
    drafts.delete(`${userId}:${shiftId}`);
  });
  await assert.rejects(deleteShiftWithDraft({ token: 'token', user: { id: 7 } }, 12), {
    status: 500, message: 'Nie udało się usunąć zmiany.',
  });
  assert.equal(clear.mock.callCount(), 0);
  assert.deepEqual(drafts.get('7:12'), draft);
});

test('click events seed only used platforms; manual final counts do not create timestamps', () => {
  const events = [
    { platform: 'glovo', clickedAt: '2026-11-01T10:00:00.000Z' },
    { platform: 'wolt', clickedAt: '2026-11-01T10:01:00.000Z' },
    { platform: 'glovo', clickedAt: '2026-11-01T10:02:00.000Z' },
  ];
  const entries = entriesFromOrderEvents(events);
  assert.deepEqual(entries, [{ platform: 'glovo', earningsGross: '', ordersCount: '2' },
    { platform: 'wolt', earningsGross: '', ordersCount: '1' }]);
  entries[0].ordersCount = '10';
  const payload = withOrderEvents({ platformEntries: entries }, { hasDraft: true, orderEvents: events });
  assert.equal(payload.orderEvents.length, 3);
  assert.deepEqual(payload.orderEvents, events);
  assert.deepEqual(entriesFromOrderEvents([]), []);
  assert.deepEqual(withOrderEvents({ platformEntries: entries }, null), { platformEntries: entries });
});

test('browser fallback never invokes native overlay methods', async () => {
  const native = new Proxy({}, { get() { assert.fail('Native bridge must not be used in browser'); } });
  const tracker = createFloatingTracking({ platform: { isNativePlatform: () => false }, native });
  assert.equal(tracker.available, false);
  assert.deepEqual(await tracker.canDrawOverlays(), { granted: false });
  await tracker.requestOverlayPermission();
  assert.equal((await tracker.startTracking({}, 12)).available, false);
  assert.deepEqual((await tracker.getTrackingState(1, 12)).orderEvents, []);
  await tracker.stopTracking();
  await tracker.clearTrackingDraft(1, 12);
});

test('Android wrapper scopes draft to user and shift and passes session expiry without the JWT', async () => {
  const calls = [];
  const native = {
    async startTracking(options) { calls.push(['start', options]); return { active: true }; },
    async getTrackingState(options) { calls.push(['read', options]); return { hasDraft: true, orderEvents: [] }; },
    async clearTrackingDraft(options) { calls.push(['clear', options]); },
    async stopTracking() { calls.push(['stop']); },
  };
  const tracker = createFloatingTracking({ platform: { isNativePlatform: () => true, getPlatform: () => 'android' }, native });
  const token = `header.${btoa(JSON.stringify({ exp: 2000000000 }))}.signature`;
  await tracker.startTracking({ token, user: { id: 7 } }, 12);
  await tracker.stopTracking();
  await tracker.getTrackingState(7, 12);
  await tracker.clearTrackingDraft(7, 12);
  assert.deepEqual(calls, [['start', { userId: 7, shiftId: 12, expiresAt: 2000000000000 }],
    ['stop'], ['read', { userId: 7, shiftId: 12 }], ['clear', { userId: 7, shiftId: 12 }]]);
  assert.equal(sessionExpiry('invalid'), 0);
});
