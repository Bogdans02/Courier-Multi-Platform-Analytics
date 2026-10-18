import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionService } from '../src/services/session.js';

const nativeAndroid = { isNativePlatform: () => true, getPlatform: () => 'android' };
const account = { id: 11, email: 'courier@example.com' };

function fixture({ native = true, token = null, getUser = async () => ({ user: account }) } = {}) {
  const calls = [];
  const storage = {
    async getItem(key) { calls.push(['read', key]); return token; },
    async setItem(key, value) { calls.push(['write', key, value]); token = value; },
    async removeItem(key) { calls.push(['remove', key]); token = null; },
  };
  const service = createSessionService({
    platform: native ? nativeAndroid : { isNativePlatform: () => false, getPlatform: () => 'web' },
    storage,
    getUser,
  });
  return { service, calls, storage, savedToken: () => token };
}

test('browser session never reads or writes secure storage and is not restored', async () => {
  const { service, calls } = fixture({ native: false, token: 'old-token', getUser: () => assert.fail('No browser restoration') });
  const session = { token: 'browser-token', user: account };
  assert.deepEqual(await service.save(session), session);
  assert.equal(await service.restore(), null);
  await service.clear();
  assert.deepEqual(calls, []);
});

test('Android stores JWT before accepting login and verifies the same token when restarted', async () => {
  const verified = [];
  const { service, savedToken, calls } = fixture({ getUser: async (token) => { verified.push(token); return { user: account }; } });
  const session = { token: 'original-jwt', user: account };
  assert.deepEqual(await service.save(session), session);
  assert.equal(savedToken(), session.token);
  assert.deepEqual(await service.restore(), session);
  assert.deepEqual(verified, [session.token]);
  await service.clear();
  assert.equal(savedToken(), null);
  assert.equal(await service.restore(), null);
  assert.deepEqual(calls.map(([operation]) => operation), ['write', 'read', 'remove', 'read']);
});

test('Android clears expired or rejected JWT after 401 and does not restore the account', async () => {
  const { service, savedToken } = fixture({ token: 'expired', getUser: async () => { throw Object.assign(new Error('Expired'), { status: 401 }); } });
  assert.equal(await service.restore(), null);
  assert.equal(savedToken(), null);
});

test('connection failure keeps the Android token so restoration can be retried', async () => {
  let offline = true;
  const { service, savedToken } = fixture({ token: 'valid', getUser: async () => {
    if (offline) throw new Error('Nie można połączyć się z serwerem.');
    return { user: account };
  } });
  await assert.rejects(service.restore(), /Nie można połączyć/);
  assert.equal(savedToken(), 'valid');
  offline = false;
  assert.deepEqual(await service.restore(), { token: 'valid', user: account });
});

test('native storage errors are surfaced on save, restore and logout without a fallback', async () => {
  const { service, storage, savedToken } = fixture({ token: 'stored' });
  storage.setItem = async () => { throw new Error('Keystore unavailable'); };
  storage.getItem = async () => { throw new Error('Keystore unavailable'); };
  storage.removeItem = async () => { throw new Error('Keystore unavailable'); };
  await assert.rejects(service.save({ token: 'new', user: account }), /bezpiecznie zapisać/);
  await assert.rejects(service.restore(), /odczytać zapisanej sesji/);
  await assert.rejects(service.clear(), /usunąć zapisanej sesji/);
  assert.equal(savedToken(), 'stored');
});
