import { useState } from 'react';
import { toLocalDateTime } from '../utils/shiftFormat.js';
import { shiftFormPayload, validateShiftForm } from '../utils/shiftValidation.js';

export default function ShiftForm({ shift, onSubmit, onCancel }) {
  const [values, setValues] = useState({
    startedAt: toLocalDateTime(shift.startedAt),
    endedAt: toLocalDateTime(shift.endedAt),
    distanceKm: shift.distanceKm ?? '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  function change(event) {
    setValues({ ...values, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    const message = validateShiftForm(values);
    setError(message);
    if (message) return;
    setPending(true);
    try {
      await onSubmit(shiftFormPayload(values));
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-4">
        <div>
          <label htmlFor="startedAt" className="mb-1 block font-medium">Rozpoczęcie</label>
          <input id="startedAt" name="startedAt" type="datetime-local" step="0.001" required
            value={values.startedAt} onChange={change}
            className="w-full min-w-0 rounded border border-slate-400 bg-white px-3 py-3" />
        </div>
        <div>
          <label htmlFor="endedAt" className="mb-1 block font-medium">Zakończenie</label>
          <input id="endedAt" name="endedAt" type="datetime-local" step="0.001" required
            value={values.endedAt} onChange={change}
            className="w-full min-w-0 rounded border border-slate-400 bg-white px-3 py-3" />
        </div>
        <div>
          <label htmlFor="distanceKm" className="mb-1 block font-medium">Dystans (km, opcjonalnie)</label>
          <input id="distanceKm" name="distanceKm" type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01"
            value={values.distanceKm} onChange={change}
            className="w-full rounded border border-slate-400 bg-white px-3 py-3" />
        </div>
        <button type="submit" className="w-full rounded bg-slate-800 px-4 py-3 font-semibold text-white disabled:opacity-60">
          {pending ? 'Zapisywanie...' : 'Zapisz zmianę'}
        </button>
        <button type="button" onClick={onCancel} className="w-full rounded border border-slate-400 px-4 py-3">Anuluj</button>
      </fieldset>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </form>
  );
}
