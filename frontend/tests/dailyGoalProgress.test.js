import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestServer, SETUP_TIMEOUT_MS, CLEANUP_TIMEOUT_MS } from './helpers/viteServer.mjs';

let server;
let DailyGoalProgress;
before(async () => {
  server = await createTestServer(close => after(close, { timeout: CLEANUP_TIMEOUT_MS }));
  DailyGoalProgress = (await server.ssrLoadModule('/src/components/DailyGoalProgress.jsx')).default;
}, { timeout: SETUP_TIMEOUT_MS });

const render = (props) => renderToStaticMarkup(createElement(DailyGoalProgress, props));

test('no goal set renders nothing', () => {
  assert.equal(render({ earnings: '120.00', goal: null }), '');
});

test('goal in progress shows label, amounts, a clamped bar and no reached message', () => {
  const markup = render({ earnings: '150.00', goal: '200.00' });
  assert.match(markup, /Cel dzienny · 75%/); // podpis z procentem (150/200)
  assert.match(markup, /150,00/); // zarobek
  assert.match(markup, /200,00/); // cel
  assert.match(markup, /aria-valuenow="75"/); // 150/200 = 75%
  assert.match(markup, /width:75%/);
  assert.doesNotMatch(markup, /Cel osiągnięty/);
  assert.doesNotMatch(markup, /is-reached/);
  // To wiersz wbudowany, a nie osobna karta z własnym nagłówkiem sekcji.
  assert.doesNotMatch(markup, /<section/);
});

test('reaching the goal marks the bar green, caps at 100% and shows the reached message', () => {
  const markup = render({ earnings: '250.00', goal: '200.00' });
  assert.match(markup, /Cel dzienny · 100%/); // procent też obcięty do 100
  assert.match(markup, /aria-valuenow="100"/); // obcięte do 100, choć zarobek > cel
  assert.match(markup, /width:100%/);
  assert.match(markup, /is-reached/);
  assert.match(markup, /Cel osiągnięty/);
});
