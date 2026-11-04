import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { hourlyActivityChartData } from '../src/utils/analyticsFormat.js';
import { getDetails } from '../src/services/api/analytics.js';
import { platforms } from '../src/utils/platformEntries.js';

let server;
let Hourly;
before(async () => {
  server = await createServer({ server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  Hourly = (await server.ssrLoadModule('/src/components/AnalyticsHourlyActivity.jsx')).default;
});
after(async () => { await server?.close(); });

function fixture(eventPlatform = 'all') {
  return { eventPlatform, mode: eventPlatform === 'all' ? 'rate' : 'count', status: 'available', emptyReason: null,
    groups: Array.from({ length: 12 }, (_, i) => ({ key: String(i),
      label: `${String(i * 2).padStart(2, '0')}:00–${String(i * 2 + 2).padStart(2, '0')}:00`,
      status: 'available', registeredOrders: i === 5 ? 4 : 6, workHours: 3,
      registeredOrdersPerHour: i === 5 ? '4.00' : '2.00' })),
    bestIntervals: { status: eventPlatform === 'all' ? 'available' : 'unavailable',
      registeredOrdersPerHour: eventPlatform === 'all' ? '4.00' : null, keys: eventPlatform === 'all' ? ['5'] : [] },
    quality: { coverageStatus: 'unknown', cohortShiftCount: 8, includedShiftCount: 2, shiftsWithoutValidEvents: 3,
      invalidEventCount: 4, excludedOverlapShiftCount: 3, overlapEventCount: 5, excludedEventCount: 9 } };
}
const props = activity => ({ activity, status: 'success', eventPlatform: activity.eventPlatform,
  onEventPlatformChange() {}, onRetry() {} });
const render = (activity = fixture(), extra = {}) => renderToStaticMarkup(createElement(Hourly, { ...props(activity), ...extra }));

test('hourly chart maps the 12 ready backend buckets and rates without dividing counts by time or replacing missing samples with zero', () => {
  const activity = fixture();
  activity.groups[0] = { ...activity.groups[0], registeredOrders: null, registeredOrdersPerHour: null, workHours: 0, status: 'no_data' };
  activity.groups[1].registeredOrdersPerHour = '0.00';
  activity.groups[2].registeredOrdersPerHour = null;
  const data = hourlyActivityChartData(activity);
  assert.equal(data.labels.length, 12);
  assert.equal(data.labels[0], '00:00–02:00');
  assert.equal(data.labels.at(-1), '22:00–24:00');
  assert.deepEqual(data.values.slice(0, 3), [null, 0, null]);
  assert.equal(data.values[5], 4); // The backend rate wins over 4 events / 3 rounded hours.
  const markup = render(activity);
  assert.match(markup, /Brak próby/);
  assert.match(markup, /Nieobliczalny wynik/);
});

test('all platforms show one accessible hourly chart, 12 table rows, source/quality information and the backend winner rather than largest count', () => {
  const markup = render();
  assert.equal((markup.match(/<canvas /g) ?? []).length, 1);
  assert.equal((markup.match(/scope="row"/g) ?? []).length, 12);
  assert.match(markup, /Najaktywniejsza pora[\s\S]*10:00–12:00/);
  assert.match(markup, /4 dostawy\/h/);
  assert.match(markup, /role="region"[^>]*tabindex="0"/);
  assert.match(markup, /Floating Order Tracking/);
  assert.match(markup, /nie potwierdza kompletności wszystkich dostaw/);
  assert.match(markup, /Kompletność rejestracji: nieznana/);
  assert.match(markup, /Zmiany w próbie<\/dt><dd>2/);
  assert.match(markup, /Łącznie wykluczone zdarzenia<\/dt><dd>9/);
  assert.doesNotMatch(markup, /zł|Brutto|Szacowane netto|ordersCount|coverageStatus/);
});

test('backend ties retain all labels in order and all-zero/no-data rankings never invent a winner', () => {
  const activity = fixture();
  activity.bestIntervals.keys = ['3', '6'];
  assert.match(render(activity), /06:00–08:00, 12:00–14:00/);
  activity.bestIntervals = { status: 'all_zero', registeredOrdersPerHour: '0.00', keys: [] };
  assert.match(render(activity), /Brak wyróżniającej się pory/);
  assert.doesNotMatch(render(activity), /analytics-best-result/);
  activity.bestIntervals = { status: 'no_data', registeredOrdersPerHour: null, keys: [] };
  assert.match(render(activity), /Brak danych do porównania przedziałów/);
});

test('all six individual platform modes show counts only; zero events in an existing sample stay visible and no platform ranking or hourly rate is shown', () => {
  for (const platform of platforms) {
    const activity = fixture(platform.value);
    activity.groups.forEach(group => { group.registeredOrders = 0; });
    const markup = render(activity);
    assert.match(markup, new RegExp(`value="${platform.value}" selected`));
    assert.match(markup, /Zamówienia — liczba zarejestrowanych dostaw/);
    assert.match(markup, /W dostępnej próbie nie zarejestrowano dostaw tej platformy/);
    assert.equal((markup.match(/<td>0<\/td>/g) ?? []).length, 12);
    assert.equal((markup.match(/<canvas /g) ?? []).length, 1);
    assert.doesNotMatch(markup.replace(/<[^>]*>/g, ' '), /Najaktywniejsza pora|\/h|workHours|Czas pracy/);
    assert.deepEqual(hourlyActivityChartData(activity).values, Array(12).fill(0));
  }
});

test('empty cohorts, no events, overlap and invalid events have distinct empty reasons; unavailable metrics are not an observed zero', () => {
  const messages = { no_completed_shifts: /Brak zakończonych i uzupełnionych zmian/,
    no_events: /Brak zarejestrowanych dostaw w tym okresie/,
    overlapping_shifts: /nakładają się w czasie i zostały pominięte/,
    no_valid_events: /Brak zarejestrowanych dostaw mieszczących się w czasie zmian/ };
  for (const [reason, pattern] of Object.entries(messages)) {
    const activity = fixture();
    activity.status = 'no_data';
    activity.emptyReason = reason;
    activity.groups.forEach(group => { Object.assign(group, { status: 'no_data', registeredOrders: null, registeredOrdersPerHour: null, workHours: 0 }); });
    activity.bestIntervals = { status: 'no_data', registeredOrdersPerHour: null, keys: [] };
    const markup = render(activity);
    assert.match(markup, pattern);
    assert.doesNotMatch(markup, /<canvas |<td>0<\/td>/);
  }
  const activity = fixture();
  activity.groups.forEach(group => { group.registeredOrdersPerHour = null; });
  assert.match(render(activity), /Brak obliczalnego wyniku dla wybranego trybu/);
});

test('loading and error hide stale hourly data, while filter changes and retry use their supplied callbacks', () => {
  const activity = fixture();
  const loading = render(activity, { status: 'loading' });
  assert.match(loading, /role="status"[^>]*>Wczytywanie/);
  assert.doesNotMatch(loading, /<canvas |Najaktywniejsza pora|Informacje o próbie/);
  const error = render(activity, { status: 'error', message: 'Błąd godzin.' });
  assert.match(error, /role="alert">Błąd godzin/);
  assert.doesNotMatch(error, /<canvas /);
  let chosen;
  let retried = false;
  const tree = Hourly({ ...props(activity), status: 'error', message: 'Błąd godzin.',
    onEventPlatformChange: value => { chosen = value; }, onRetry: () => { retried = true; } });
  tree.props.children[1].props.children[1].props.onChange({ target: { value: 'wolt' } });
  tree.props.children[4].props.children[1].props.onClick();
  assert.equal(chosen, 'wolt');
  assert.equal(retried, true);
});

test('eventPlatform is independent of platform and preserves JWT, signal, calendar/anchor/asOf and both modes, while legacy details stay unchanged', async (t) => {
  const signal = new AbortController().signal;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(new URL(url));
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.equal(options.signal, signal);
    return new Response(JSON.stringify({ details: { hourlyActivity: fixture() } }));
  });
  const query = { calendar: 'month', anchor: '2026-11-01', asOf: '2026-11-04T12:00:00.123Z' };
  for (const mode of ['gross', 'estimated_net']) {
    for (const platform of ['all', ...platforms.map(item => item.value)]) {
      const response = await getDetails('token', query, 'all', signal, mode, platform);
      const params = requests.at(-1).searchParams;
      assert.equal(params.get('eventPlatform'), platform);
      assert.equal(params.get('platform'), 'all');
      assert.equal(params.get('asOf'), query.asOf);
      assert.equal(params.get('anchor'), query.anchor);
      assert.equal(params.get('calendar'), 'month');
      assert.equal(params.get('mode'), mode === 'gross' ? null : mode);
      assert.deepEqual(hourlyActivityChartData(response.details.hourlyActivity), hourlyActivityChartData(fixture()));
    }
  }
  await getDetails('token', 'current_week', 'all', signal);
  assert.equal(requests.at(-1).searchParams.get('eventPlatform'), null);
  assert.equal(requests.at(-1).searchParams.get('period'), 'current_week');
  await getDetails('token', { calendar: 'all', asOf: query.asOf }, 'glovo', signal, 'gross', 'wolt');
  assert.equal(requests.at(-1).searchParams.get('anchor'), null);
  assert.equal(requests.at(-1).searchParams.get('platform'), 'glovo');
  assert.equal(requests.at(-1).searchParams.get('eventPlatform'), 'wolt');
});

test('cancelled event platform responses cannot replace the new one; errors and retry keep the same eventPlatform/asOf and preserve 401', async (t) => {
  const query = { calendar: 'week', anchor: '2026-11-02', asOf: '2026-11-04T12:00:00Z' };
  let release;
  let calls = 0;
  const mock = t.mock.method(globalThis, 'fetch', () => ++calls === 1 ? new Promise(resolve => { release = resolve; })
    : Promise.resolve(new Response(JSON.stringify({ details: { hourlyActivity: fixture('wolt') } }))));
  const oldController = new AbortController();
  const old = getDetails('token', query, 'all', oldController.signal, 'gross', 'glovo');
  oldController.abort();
  const current = await getDetails('token', query, 'all', undefined, 'gross', 'wolt');
  assert.equal(current.details.hourlyActivity.eventPlatform, 'wolt');
  release(new Response(JSON.stringify({ details: { hourlyActivity: fixture('glovo') } })));
  await assert.rejects(old, { name: 'AbortError' });
  const urls = [];
  mock.mock.mockImplementation(async url => {
    urls.push(url);
    return urls.length === 1 ? new Response('{"message":"Błąd godzin."}', { status: 503 }) : new Response('{"details":{}}');
  });
  await assert.rejects(getDetails('token', query, 'all', undefined, 'gross', 'wolt'), { status: 503 });
  await getDetails('token', query, 'all', undefined, 'gross', 'wolt');
  assert.equal(urls[0], urls[1]);
  mock.mock.mockImplementation(async () => new Response('{"message":"Sesja wygasła."}', { status: 401 }));
  await assert.rejects(getDetails('token', query, 'all', undefined, 'gross', 'wolt'), { status: 401 });
});
