import test from 'node:test';
import assert from 'node:assert/strict';
import { platforms, activePlatformList } from '../src/utils/platformEntries.js';
import { activePlatformsPayload } from '../src/utils/netSettings.js';

const allValues = platforms.map(({ value }) => value);

test('activePlatformList returns all platforms when nothing is configured', () => {
  // null / undefined / pusta tablica = brak filtra = wszystkie platformy, w kanonicznej kolejności.
  for (const value of [null, undefined, []]) {
    assert.deepEqual(activePlatformList(value), platforms);
  }
});

test('activePlatformList keeps only active platforms in canonical order', () => {
  const result = activePlatformList(['wolt', 'glovo']);
  assert.deepEqual(result.map(({ value }) => value), ['glovo', 'wolt']); // kolejność kanoniczna, nie wejściowa
});

test('activePlatformsPayload stores a subset but collapses the full set to null', () => {
  // Wszystkie zaznaczone = brak filtra (null), spójnie z domyślnym stanem.
  assert.deepEqual(activePlatformsPayload(allValues, allValues), { activePlatforms: null });
  // Podzbiór zapisuje się w kanonicznej kolejności.
  assert.deepEqual(activePlatformsPayload(['wolt', 'glovo'], allValues), { activePlatforms: ['glovo', 'wolt'] });
  // Pusty wybór jest błędem (UI też to blokuje).
  assert.throws(() => activePlatformsPayload([], allValues), /przynajmniej jedną platformę/);
});
