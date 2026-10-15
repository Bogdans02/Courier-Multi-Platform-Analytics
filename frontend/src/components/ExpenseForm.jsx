import { useState } from 'react';
import { expenseCategories, expensePayload, todayDate } from '../utils/expenseValidation.js';
import { formatDateTime } from '../utils/shiftFormat.js';

export default function ExpenseForm({ expense, shifts, initialShiftId, onSubmit, onCancel }) {
  const [values, setValues] = useState({ category: expense?.category ?? '', amount: expense?.amount ?? '',
    expenseDate: expense?.expenseDate ?? todayDate(), shiftId: expense?.shiftId ?? initialShiftId ?? '', note: expense?.note ?? '' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  function change(event) { setValues({ ...values, [event.target.name]: event.target.value }); setError(''); }
  async function submit(event) {
    event.preventDefault();
    let payload;
    try { payload = expensePayload(values); }
    catch (error) { setError(error.message); return; }
    setPending(true);
    setError('');
    try { await onSubmit(payload); }
    catch (error) { setError(error.message); }
    finally { setPending(false); }
  }

  const inputClass = 'w-full rounded border border-slate-400 bg-white p-3';
  return <form onSubmit={submit} className="space-y-3 rounded border border-slate-300 bg-white p-4">
    <h2 className="text-xl font-semibold">{expense ? 'Edytuj koszt' : 'Dodaj koszt'}</h2>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <fieldset disabled={pending} className="space-y-3 disabled:opacity-60">
      <legend className="sr-only">Dane kosztu</legend>
      <label htmlFor="expense-category" className="block">Kategoria</label>
      <select id="expense-category" name="category" value={values.category} onChange={change} className={inputClass}>
        <option value="">Wybierz kategorię</option>
        {expenseCategories.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
      </select>
      <label htmlFor="expense-amount" className="block">Kwota kosztu (PLN)</label>
      <input id="expense-amount" name="amount" inputMode="decimal" value={values.amount} onChange={change} className={inputClass} />
      <label htmlFor="expense-date" className="block">Data kosztu</label>
      <input id="expense-date" name="expenseDate" type="date" value={values.expenseDate} onChange={change} className={inputClass} />
      <label htmlFor="expense-shift" className="block">Powiązana zmiana (opcjonalnie)</label>
      <select id="expense-shift" name="shiftId" value={values.shiftId} onChange={change} className={inputClass}>
        <option value="">Bez powiązania ze zmianą</option>
        {shifts.map((shift) => <option value={shift.id} key={shift.id}>
          {formatDateTime(shift.startedAt)}{shift.status === 'active' ? ' — trwa' : ''} (#{shift.id})
        </option>)}
      </select>
      <label htmlFor="expense-note" className="block">Notatka (opcjonalnie)</label>
      <textarea id="expense-note" name="note" rows={3} value={values.note} onChange={change} className={inputClass} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="rounded bg-slate-800 px-4 py-3 text-white">{pending ? 'Zapisywanie...' : 'Zapisz koszt'}</button>
        {expense && <button type="button" onClick={onCancel} className="rounded border border-slate-400 px-4 py-3">Anuluj edycję</button>}
      </div>
    </fieldset>
  </form>;
}
