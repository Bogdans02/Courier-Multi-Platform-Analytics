import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { waterfallSteps } from '../src/utils/waterfall.js';

let server;
let Waterfall;
before(async () => {
  server = await createServer({ server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  Waterfall = (await server.ssrLoadModule('/src/components/AnalyticsWaterfall.jsx')).default;
});
after(async () => { await server?.close(); });

const render = summary => renderToStaticMarkup(createElement(Waterfall, { summary }));

test('waterfall subtracts tax and fuel in cents and hides steps that subtract nothing', () => {
  // Netto: brutto 200, podatek 40 (200-160), paliwo 4.80 -> na rękę 155.20.
  assert.deepEqual(waterfallSteps({ grossEarnings: '200.00', totalEarnings: '160.00', fuelCost: '4.80', takeHome: '155.20' }), {
    gross: 200, takeHome: 155.2,
    deductions: [{ key: 'tax', label: 'Podatek (szac.)', amount: 40 }, { key: 'fuel', label: 'Paliwo', amount: 4.8 }],
  });
  // Brutto (bez podatku): tylko paliwo.
  assert.deepEqual(waterfallSteps({ grossEarnings: '200.00', totalEarnings: '200.00', fuelCost: '4.80', takeHome: '195.20' }).deductions,
    [{ key: 'fuel', label: 'Paliwo', amount: 4.8 }]);
  // Bez paliwa (rower / brak km): tylko podatek.
  assert.deepEqual(waterfallSteps({ grossEarnings: '200.00', totalEarnings: '160.00', fuelCost: '0.00', takeHome: '160.00' }).deductions,
    [{ key: 'tax', label: 'Podatek (szac.)', amount: 40 }]);
  // Brutto bez paliwa: brak kroków.
  assert.deepEqual(waterfallSteps({ grossEarnings: '200.00', totalEarnings: '200.00', fuelCost: '0.00', takeHome: '200.00' }).deductions, []);
});

test('waterfall is null without the numbers it needs', () => {
  assert.equal(waterfallSteps(null), null);
  assert.equal(waterfallSteps({ grossEarnings: '100.00' }), null); // brak takeHome
  assert.equal(waterfallSteps({ takeHome: '100.00' }), null); // brak grossEarnings
});

test('card renders brutto, deduction rows and take-home, and hides when nothing is deducted', () => {
  const markup = render({ grossEarnings: '200.00', totalEarnings: '160.00', fuelCost: '4.80', takeHome: '155.20',
    distanceShiftCount: 2, totalDistance: '10' });
  assert.match(markup, /Co zostaje na rękę/);
  assert.match(markup, /Brutto/);
  assert.match(markup, /− Podatek/);
  assert.match(markup, /− Paliwo/);
  assert.match(markup, /Na rękę/);
  assert.match(markup, /155,20/);
  assert.match(markup, /dystansu zmian \(10 km\)/);
  // Gdy nie ma czego odejmować, karta w ogóle się nie pojawia.
  assert.equal(render({ grossEarnings: '200.00', totalEarnings: '200.00', fuelCost: '0.00', takeHome: '200.00' }), '');
  // Fiszka o dystansie tylko gdy jest krok paliwa.
  assert.doesNotMatch(render({ grossEarnings: '200.00', totalEarnings: '160.00', fuelCost: '0.00', takeHome: '160.00',
    distanceShiftCount: 2, totalDistance: '10' }), /dystansu zmian/);
});
