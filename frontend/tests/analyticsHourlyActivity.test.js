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

function heatmapFixture(eventPlatform = 'all') {
  const activity = fixture(eventPlatform);
  const rate = eventPlatform === 'all';
  const weekdayLabels = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
  // Siatka 7×12: aktywne komórki w pon-czw, najgorętsza we wtorek 18:00.
  const active = new Map([['1-5', 1], ['2-9', rate ? 2.5 : 5], ['2-10', 1.5], ['4-5', 1], ['4-9', 1],
    ['5-6', 0.5], ['6-9', 1], ['7-4', 0.5]]);
  const cells = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    for (let hour = 0; hour < 12; hour++) {
      const value = active.get(`${weekday}-${hour}`) ?? null;
      cells.push({ weekday, hour, label: `${weekdayLabels[weekday - 1]} ${String(hour * 2).padStart(2, '0')}:00–${String(hour * 2 + 2).padStart(2, '0')}:00`,
        status: value === null ? 'no_data' : 'available', registeredOrders: value === null ? null : 2, value });
    }
  }
  return { ...activity, weekdayLabels, cells,
    coverage: { activeCells: active.size, activeWeekdays: 5, sufficient: true },
    best: rate ? { weekday: 2, hour: 9, label: 'Wtorek 18:00–20:00', value: 2.5 }
      : { weekday: 2, hour: 9, label: 'Wtorek 18:00–20:00', value: 5 } };
}

test('sufficient coverage shows the day×hour heatmap with the hottest cell and hides the simple hourly chart', () => {
  const markup = render(heatmapFixture());
  assert.match(markup, /Kiedy jest gorąco/);
  assert.match(markup, /Najcieplej:[\s\S]*Wtorek 18:00–20:00/);
  assert.match(markup, /2,5 dostawy\/h/);
  // Siatka: 12 kolumn godzin + 7 wierszy dni (nagłówki), bez wykresu słupkowego.
  assert.equal((markup.match(/<table /g) ?? []).length, 1);
  assert.match(markup, /scope="col">00</);
  assert.match(markup, /scope="row">Wt</);
  assert.doesNotMatch(markup, /<canvas /);
  assert.match(markup, /role="region"[^>]*tabindex="0"/);
});

test('insufficient coverage shows a hint and no chart or heatmap, instead of a sparse view', () => {
  const sparse = heatmapFixture();
  sparse.coverage = { activeCells: 3, activeWeekdays: 2, sufficient: false };
  const markup = render(sparse);
  assert.doesNotMatch(markup, /Kiedy jest gorąco/);
  assert.equal((markup.match(/<canvas /g) ?? []).length, 0);
  assert.match(markup, /za mało danych, aby pokazać mapę godzin/);
  // Sekcja i jej kontrolki zostają na miejscu także bez danych.
  assert.match(markup, /Godziny/);
  assert.match(markup, /Platforma zarejestrowanych dostaw/);
});

test('heatmap cells are accessible touch and keyboard controls, preselecting the hottest cell', () => {
  const markup = render(heatmapFixture());
  assert.equal((markup.match(/class="analytics-heatmap-cell"/g) ?? []).length, 84);
  // Najgorętsza komórka jest zaznaczona od razu, a jej wynik widoczny w podpowiedzi — bez dotykania mapy.
  assert.match(markup, /<button type="button"[^>]*aria-label="Wtorek 18:00–20:00: 2,5 dostawy\/h"[^>]*aria-pressed="true"/);
  assert.match(markup, /aria-label="Poniedziałek 00:00–02:00: Brak danych"[^>]*aria-pressed="false"/);
  assert.match(markup, /role="status" aria-atomic="true">[\s\S]*Wtorek 18:00–20:00[\s\S]*2,5 dostawy\/h/);
});

test('heatmap without a hottest cell falls back to the touch hint and no preselection', () => {
  const activity = heatmapFixture();
  activity.best = null;
  const markup = render(activity);
  assert.doesNotMatch(markup, /aria-pressed="true"/);
  assert.match(markup, /role="status" aria-atomic="true">Dotknij komórki/);
});

test('count-mode heatmap shows order counts and no rate unit', () => {
  const markup = render(heatmapFixture('wolt'));
  assert.match(markup, /Najcieplej:[\s\S]*Wtorek 18:00–20:00/);
  assert.match(markup, /5 dostawy/);
  assert.doesNotMatch(markup, /dostawy\/h/);
});

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
});

test('without sufficient coverage the section still shows its selector and honest source note, but a hint instead of a chart', () => {
  const markup = render();
  // Mało danych (brak coverage) → podpowiedź, bez wykresu i bez rankingu „Najaktywniejsza pora”.
  assert.equal((markup.match(/<canvas /g) ?? []).length, 0);
  assert.match(markup, /za mało danych, aby pokazać mapę godzin/);
  assert.doesNotMatch(markup, /Najaktywniejsza pora|Dostawy na godzinę/);
  // Sekcja, selektor i jednowierszowa notka o źródle zostają zawsze.
  assert.match(markup, /Godziny/);
  assert.match(markup, /Platforma zarejestrowanych dostaw/);
  assert.match(markup, /ręcznie rejestrowanych dostaw/);
  assert.match(markup, /Nie potwierdza kompletności wszystkich dostaw/);
  assert.doesNotMatch(markup, /zł|Brutto|Szacowane netto|coverageStatus/);
});

test('every platform filter stays available and shows the same hint until coverage is sufficient', () => {
  for (const platform of platforms) {
    const activity = fixture(platform.value);
    const markup = render(activity);
    assert.match(markup, new RegExp(`value="${platform.value}" selected`));
    assert.equal((markup.match(/<canvas /g) ?? []).length, 0);
    assert.match(markup, /za mało danych, aby pokazać mapę godzin/);
    assert.doesNotMatch(markup, /Kiedy jest gorąco|Najaktywniejsza pora/);
  }
});

test('empty cohorts still show the section with its hint and never a chart, regardless of the empty reason', () => {
  for (const reason of ['no_completed_shifts', 'no_events', 'overlapping_shifts', 'no_valid_events']) {
    const activity = fixture();
    activity.status = 'no_data';
    activity.emptyReason = reason;
    activity.groups.forEach(group => { Object.assign(group, { status: 'no_data', registeredOrders: null, registeredOrdersPerHour: null, workHours: 0 }); });
    const markup = render(activity);
    assert.match(markup, /za mało danych, aby pokazać mapę godzin/);
    assert.doesNotMatch(markup, /<canvas /);
  }
});

test('loading and error hide stale hourly data, while filter changes and retry use their supplied callbacks', () => {
  const activity = fixture();
  const loading = render(activity, { status: 'loading' });
  assert.match(loading, /role="status"[^>]*>Wczytywanie/);
  assert.doesNotMatch(loading, /<canvas |Najaktywniejsza pora|za mało danych/);
  const error = render(activity, { status: 'error', message: 'Błąd godzin.' });
  assert.match(error, /role="alert">Błąd godzin/);
  assert.doesNotMatch(error, /<canvas /);
  // The select and the retry button use the supplied callbacks.
  let chosen;
  let retried = false;
  const tree = Hourly({ ...props(activity), status: 'error', message: 'Błąd godzin.',
    onEventPlatformChange: value => { chosen = value; }, onRetry: () => { retried = true; } });
  const flat = node => Array.isArray(node) ? node.flatMap(flat) : (node && node.props ? [node, ...flat(node.props.children)] : []);
  const nodes = flat(tree.props.children);
  nodes.find(n => n.type === 'select').props.onChange({ target: { value: 'wolt' } });
  nodes.find(n => n.type === 'button').props.onClick();
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
