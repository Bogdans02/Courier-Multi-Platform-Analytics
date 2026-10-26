import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { createExpense, getExpenses, updateExpense, deleteExpense } from '../services/api/expenses.js';
import { getShifts, getActiveShift } from '../services/api/shifts.js';
import { expenseCategories, validateExpenseFilters } from '../utils/expenseValidation.js';
import { formatMoney } from '../utils/shiftFormat.js';
import ExpenseForm from '../components/ExpenseForm.jsx';

const emptyFilters = { from: '', to: '', category: '' };

export default function Expenses({ session, onSessionExpired, adding = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(emptyFilters);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filterError, setFilterError] = useState('');
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ key: '', status: 'loading' });
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(location.state?.message ?? '');
  const [error, setError] = useState('');
  const key = `${JSON.stringify(filters)}/${reload}`;
  const current = result.key === key ? result : { status: 'loading' };

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getExpenses(session.token, filters, controller.signal), getShifts(session.token, controller.signal),
      getActiveShift(session.token, controller.signal)]).then(([{ expenses }, { shifts }, { shift }]) => {
      if (!controller.signal.aborted) setResult({ key, status: 'success', expenses,
        shifts: shift ? [shift, ...shifts] : shifts });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error.status === 401) onSessionExpired();
      else setResult({ key, status: 'error', message: error.message });
    });
    return () => controller.abort();
  }, [session.token, filters, key, onSessionExpired]);

  async function save(body) {
    try {
      if (!adding && editing) await updateExpense(session.token, editing.id, body);
      else await createExpense(session.token, body);
      setEditing(null);
      setMessage('Koszt został zapisany.');
      setReload((value) => value + 1);
      if (adding) navigate('/expenses', { state: { message: 'Koszt został zapisany.' } });
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      throw error;
    }
  }

  async function remove(id) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await deleteExpense(session.token, id);
      setConfirmDelete(null);
      if (editing?.id === id) setEditing(null);
      setMessage('Koszt został usunięty.');
      setReload((value) => value + 1);
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      else setError(error.message);
    } finally { setPending(false); }
  }

  return <>
    <div className="page-heading"><h1>{adding ? 'Nowy koszt' : 'Koszty'}</h1></div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {current.status === 'loading' && <p role="status">Wczytywanie kosztów i zmian...</p>}
    {current.status === 'error' && <div>
      <p role="alert" className="text-red-400">{current.message}</p>
      <button type="button" className="py-2 underline" onClick={() => setReload((value) => value + 1)}>Spróbuj ponownie</button>
    </div>}
    {adding && current.status === 'success' && <ExpenseForm key={`new/${reload}`}
      shifts={current.shifts} initialShiftId={location.state?.shiftId}
      onSubmit={save} onCancel={() => navigate('/expenses')} />}
    {!adding && <>
    <Link to="/expenses/new" className="button-primary">+ Dodaj koszt</Link>
    <details className="card"><summary>Filtruj koszty</summary>
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      try {
        setFilters(validateExpenseFilters(draftFilters));
        setEditing(null);
        setConfirmDelete(null);
        setFilterError('');
      }
      catch (error) { setFilterError(error.message); }
    }}>
      <label htmlFor="expense-from" className="block">Data od</label>
      <input id="expense-from" type="date" value={draftFilters.from} className="w-full rounded border border-slate-600 p-3"
        onChange={(event) => setDraftFilters({ ...draftFilters, from: event.target.value })} />
      <label htmlFor="expense-to" className="block">Data do</label>
      <input id="expense-to" type="date" value={draftFilters.to} className="w-full rounded border border-slate-600 p-3"
        onChange={(event) => setDraftFilters({ ...draftFilters, to: event.target.value })} />
      <label htmlFor="expense-filter-category" className="block">Kategoria</label>
      <select id="expense-filter-category" value={draftFilters.category} className="w-full rounded border border-slate-600 bg-slate-900 p-3"
        onChange={(event) => setDraftFilters({ ...draftFilters, category: event.target.value })}>
        <option value="">Wszystkie kategorie</option>
        {expenseCategories.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
      </select>
      {filterError && <p role="alert" className="text-red-400">{filterError}</p>}
      <button type="submit" className="rounded border border-slate-600 px-4 py-3">Zastosuj filtry</button>
    </form>
    </details>
    <h2 className="text-xl font-semibold">Historia kosztów</h2>
    {current.status === 'success' && (current.expenses.length === 0
      ? <p className="empty-state">Brak kosztów dla wybranych filtrów.</p>
      : <ul className="space-y-3">{current.expenses.map((expense) => <li key={expense.id}
        className="space-y-2 card">
        <p className="font-semibold">{expenseCategories.find(({ value }) => value === expense.category)?.label ?? expense.category}: {formatMoney(expense.amount)}</p>
        <p>Data: {expense.expenseDate.split('-').reverse().join('.')}</p>
        {expense.note && <p className="whitespace-pre-wrap break-words">{expense.note}</p>}
        <p>{expense.shiftId ? <Link to={`/shifts/${expense.shiftId}`} className="underline">Powiązana zmiana #{expense.shiftId}</Link> : 'Bez powiązania ze zmianą'}</p>
        {editing?.id === expense.id ? <ExpenseForm key={`${expense.id}/${reload}`}
          expense={editing} shifts={current.shifts} onSubmit={save} onCancel={() => setEditing(null)}
        /> : confirmDelete === expense.id ? <div className="space-y-2">
          <p>Czy na pewno usunąć ten koszt? Tej operacji nie można cofnąć.</p>
          <button type="button" disabled={pending} onClick={() => remove(expense.id)}
            className="mr-3 rounded bg-red-700 px-4 py-3 text-white disabled:opacity-60">{pending ? 'Usuwanie...' : 'Potwierdź usunięcie'}</button>
          <button type="button" disabled={pending} onClick={() => setConfirmDelete(null)} className="py-3 underline">Anuluj usuwanie</button>
        </div> : <div className="flex flex-wrap gap-3">
          <button type="button" disabled={pending} onClick={() => { setEditing(expense); setConfirmDelete(null); setMessage(''); setError(''); }}
            className="rounded border border-slate-600 px-4 py-3">Edytuj koszt</button>
          <button type="button" disabled={pending} onClick={() => { setConfirmDelete(expense.id); setError(''); }}
            className="rounded border border-red-400 px-4 py-3 text-red-400">Usuń koszt</button>
        </div>}
      </li>)}</ul>)}
    </>}
    <p><Link to={adding ? '/expenses' : '/more'} className="text-link">{adding ? 'Wróć do kosztów' : 'Wróć do Więcej'}</Link></p>
  </>;
}
