import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { deleteExpense, getExpenses } from '../services/api/expenses.js';
import { getActiveShift, getShifts } from '../services/api/shifts.js';
import { expensesByCategory, expensesTotal, shiftDateById } from '../utils/expenseSummary.js';
import { formatMoney } from '../utils/shiftFormat.js';
import ExpenseCard from './ExpenseCard.jsx';

// Pierwszy i ostatni dzień miesiąca (anchor to "RRRR-MM-01"), żeby serwer oddał tylko ten miesiąc.
function monthBounds(anchor) {
  const [year, month] = anchor.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: anchor, to: `${anchor.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}

// Lista kosztów jednego miesiąca: podsumowanie, rozbicie na kategorie i kompaktowe karty.
// Miesiąc i nawigacja miesiącami są wspólne z historią zmian (ekran nadrzędny).
export default function ExpensesList({ session, onSessionExpired, month, message }) {
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ key: '', status: 'loading' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const key = `${month}/${reload}`;
  const current = result.key === key ? result : { status: 'loading' };

  useEffect(() => {
    const controller = new AbortController();
    const { from, to } = monthBounds(month);
    Promise.all([getExpenses(session.token, { from, to }, controller.signal),
      getShifts(session.token, controller.signal), getActiveShift(session.token, controller.signal)])
      .then(([{ expenses }, { shifts }, { shift }]) => {
        if (!controller.signal.aborted) setResult({ key, status: 'success', expenses,
          shifts: shift ? [shift, ...shifts] : shifts });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setResult({ key, status: 'error', message: error.message });
      });
    return () => controller.abort();
  }, [session.token, month, key, onSessionExpired]);

  async function remove(id) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await deleteExpense(session.token, id);
      setConfirmDelete(null);
      setNotice('Koszt został usunięty.');
      setReload((value) => value + 1);
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      else setError(error.message);
    } finally { setPending(false); }
  }

  const dateOf = current.status === 'success' ? shiftDateById(current.shifts) : () => null;
  const total = current.status === 'success' ? expensesTotal(current.expenses) : null;
  const categories = current.status === 'success' ? expensesByCategory(current.expenses) : [];

  return <>
    <Link to="/expenses/new" className="button-primary w-full">+ Dodaj koszt</Link>
    {(message || notice) && <p role="status">{notice || message}</p>}
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {current.status === 'loading' && <p role="status">Wczytywanie kosztów...</p>}
    {current.status === 'error' && <div>
      <p role="alert" className="text-red-400">{current.message}</p>
      <button type="button" className="button-secondary mt-2" onClick={() => setReload((value) => value + 1)}>Spróbuj ponownie</button>
    </div>}
    {current.status === 'success' && (current.expenses.length === 0
      ? <p className="empty-state">Brak kosztów w tym miesiącu.</p>
      : <>
        <section className="card expense-summary" aria-label="Podsumowanie kosztów miesiąca">
          <div className="expense-summary-total">
            <span className="muted text-xs">Wydatki w miesiącu</span>
            <strong>{formatMoney(total.amount)}</strong>
          </div>
          <ul className="expense-breakdown">
            {categories.map((group) => <li key={group.value}>
              <span className="muted">{group.label}</span>
              <strong>{formatMoney(group.amount)}</strong>
            </li>)}
          </ul>
        </section>
        <ul className="space-y-3">
          {current.expenses.map((expense) => <ExpenseCard key={expense.id} expense={expense}
            shiftDate={dateOf(expense.shiftId)} confirming={confirmDelete === expense.id} pending={pending}
            onAskDelete={(id) => { setConfirmDelete(id); setError(''); setNotice(''); }}
            onCancelDelete={() => setConfirmDelete(null)} onDelete={remove} />)}
        </ul>
      </>)}
  </>;
}
