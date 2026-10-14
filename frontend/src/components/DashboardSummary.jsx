import { formatMoney } from '../utils/shiftFormat.js';

function number(value) {
  return value === null ? 'Brak danych' : Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
}

function money(value) {
  return value === null ? 'Brak danych' : formatMoney(value);
}

export default function DashboardSummary({ summary }) {
  const metrics = [
    [summary.mode === 'estimated_net' ? 'Łączny zarobek — szacowane netto' : 'Łączny zarobek brutto', money(summary.totalEarnings)],
    ['Liczba zmian', number(summary.shiftCount)],
    ['Łączny czas pracy', `${number(summary.totalHours)} godz.`],
    ['Łączny dystans', summary.distanceShiftCount ? `${number(summary.totalDistance)} km` : 'Brak danych'],
    ['Liczba zamówień', number(summary.totalOrders)],
    ['Średni zarobek na zmianę', money(summary.earningsPerShift)],
    ['Zarobek na godzinę (zł/h)', money(summary.earningsPerHour)],
    ['Zarobek na kilometr (zł/km)', money(summary.earningsPerKm)],
    ['Zamówienia na godzinę', number(summary.ordersPerHour)],
    ['Średni zarobek na zamówienie', money(summary.earningsPerOrder)],
  ];

  return (
    <>
      {summary.incompleteShiftCount > 0 && <p role="status">
        Zmiany oczekujące na uzupełnienie platform: {summary.incompleteShiftCount}. Uzupełnij je w historii, aby uwzględnić je w statystykach.
      </p>}
      {summary.shiftCount === 0 && <p>Brak zakończonych zmian z uzupełnionymi platformami w wybranym okresie.</p>}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded border border-slate-300 bg-white p-4">
            <dt className="text-sm text-slate-600">{label}</dt>
            <dd className="mt-1 text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-slate-600">
        Statystyki obejmują zakończone zmiany z uzupełnionymi platformami, według czasu rozpoczęcia.
        Dystans podano dla {summary.distanceShiftCount} z {summary.shiftCount} zmian.
        Zarobek na kilometr uwzględnia tylko zarobki i dystans z tych samych zmian.
        Brak danych oznacza brak podstaw do obliczenia wskaźnika.
      </p>
    </>
  );
}
