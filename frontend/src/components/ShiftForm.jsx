import { useState } from 'react';
import { formatMoney, toLocalDateTime } from '../utils/shiftFormat.js';
import { shiftFormPayload, validateShiftForm } from '../utils/shiftValidation.js';
import { platforms, platformTotals } from '../utils/platformEntries.js';

export default function ShiftForm({ shift, initialEntries, onSubmit, onCancel }) {
  const [values, setValues] = useState({
    startedAt: toLocalDateTime(shift.startedAt),
    endedAt: toLocalDateTime(shift.endedAt),
    distanceKm: shift.distanceKm ?? '',
    platformEntries: shift.platformEntries.length ? shift.platformEntries.map((entry) => ({
      platform: entry.platform, earningsGross: entry.earningsGross, ordersCount: String(entry.ordersCount),
    })) : initialEntries?.length ? initialEntries : [{ platform: 'glovo', earningsGross: '', ordersCount: '' }],
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const totals = platformTotals(values.platformEntries);

  function change(event) {
    setValues({ ...values, [event.target.name]: event.target.value });
  }

  function changeEntry(index, field, value) {
    setValues({ ...values, platformEntries: values.platformEntries.map((entry, position) => (
      position === index ? { ...entry, [field]: value } : entry
    )) });
  }

  function addEntry() {
    const next = platforms.find(({ value }) => !values.platformEntries.some((entry) => entry.platform === value));
    if (next) setValues({ ...values, platformEntries: [...values.platformEntries,
      { platform: next.value, earningsGross: '', ordersCount: '' }] });
  }

  function removeEntry(index) {
    setValues({ ...values, platformEntries: values.platformEntries.filter((_entry, position) => position !== index) });
  }

  async function submit(event) {
    event.preventDefault();
    const message = validateShiftForm(values, shift);
    setError(message);
    if (message) return;
    setPending(true);
    try {
      await onSubmit(shiftFormPayload(values, shift));
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-4">
        <div>
          <label htmlFor="startedAt" className="mb-1 block font-medium">Rozpoczęcie</label>
          <input id="startedAt" name="startedAt" type="datetime-local" required
            value={values.startedAt} onChange={change}
            className="form-input" />
        </div>
        <div>
          <label htmlFor="endedAt" className="mb-1 block font-medium">Zakończenie</label>
          <input id="endedAt" name="endedAt" type="datetime-local" required
            value={values.endedAt} onChange={change}
            className="form-input" />
        </div>
        <div>
          <label htmlFor="distanceKm" className="mb-1 block font-medium">Dystans (km, opcjonalnie)</label>
          <input id="distanceKm" name="distanceKm" type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01"
            value={values.distanceKm} onChange={change}
            className="form-input" />
        </div>
        {values.platformEntries.map((entry, index) => (
          <fieldset key={index} className="space-y-3 rounded-ui border border-line p-3">
            <legend className="px-1 font-semibold">Platforma {index + 1}</legend>
            <div>
              <label htmlFor={`platform-${index}`} className="mb-1 block font-medium">Platforma</label>
              <select id={`platform-${index}`} value={entry.platform} required
                onChange={(event) => changeEntry(index, 'platform', event.target.value)}
                className="form-input">
                {platforms.map(({ value, label }) => <option key={value} value={value}
                  disabled={values.platformEntries.some((other, position) => position !== index && other.platform === value)}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`earnings-${index}`} className="mb-1 block font-medium">Zarobek brutto (PLN)</label>
              <input id={`earnings-${index}`} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" required
                value={entry.earningsGross} onChange={(event) => changeEntry(index, 'earningsGross', event.target.value)}
                className="form-input" />
            </div>
            <div>
              <label htmlFor={`orders-${index}`} className="mb-1 block font-medium">Liczba zamówień</label>
              <input id={`orders-${index}`} type="number" inputMode="numeric" min="0" max="2147483647" step="1" required
                value={entry.ordersCount} onChange={(event) => changeEntry(index, 'ordersCount', event.target.value)}
                className="form-input" />
            </div>
            {values.platformEntries.length > 1 && <button type="button" onClick={() => removeEntry(index)}
              className="button-danger">Usuń platformę {index + 1}</button>}
          </fieldset>
        ))}
        <button type="button" disabled={values.platformEntries.length === platforms.length} onClick={addEntry}
          className="button-secondary w-full">+ Dodaj kolejną platformę</button>
        <div aria-live="polite" className="rounded-ui bg-surface-raised p-3">
          <p>Łączny zarobek brutto: <strong>{formatMoney(totals.totalEarnings)}</strong></p>
          <p>Łączna liczba zamówień: <strong>{totals.totalOrders}</strong></p>
        </div>
        <button type="submit" className="button-primary w-full">
          {pending ? 'Zapisywanie...' : 'Zapisz zmianę'}
        </button>
        <button type="button" onClick={onCancel} className="button-secondary w-full">Anuluj</button>
      </fieldset>
      {error && <p role="alert" className="text-red-400">{error}</p>}
    </form>
  );
}
