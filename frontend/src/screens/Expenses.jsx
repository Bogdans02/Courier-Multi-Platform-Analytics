import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { createExpense, getExpenses, updateExpense } from '../services/api/expenses.js';
import { getActiveShift, getShifts } from '../services/api/shifts.js';
import ExpenseForm from '../components/ExpenseForm.jsx';
import BackLink from '../components/BackLink.jsx';

// Osobny ekran dodawania i edycji kosztu. Lista kosztów żyje w Historii (zakładka Koszty).
export default function Expenses({ session, onSessionExpired, mode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const editing = mode === 'edit';
  const expenseId = editing ? Number(params.id) : null;
  const [result, setResult] = useState({ status: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // W edycji pobieramy też sam koszt (brak osobnego endpointu — bierzemy z listy lub ze stanu nawigacji).
    const needsExpense = editing && !location.state?.expense;
    Promise.all([getShifts(session.token, controller.signal), getActiveShift(session.token, controller.signal),
      needsExpense ? getExpenses(session.token, {}, controller.signal) : Promise.resolve(null)])
      .then(([{ shifts }, { shift }, list]) => {
        if (controller.signal.aborted) return;
        const expense = location.state?.expense ?? list?.expenses.find((item) => item.id === expenseId) ?? null;
        if (editing && !expense) { setResult({ status: 'error', message: 'Nie znaleziono kosztu.' }); return; }
        setResult({ status: 'success', shifts: shift ? [shift, ...shifts] : shifts, expense });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setResult({ status: 'error', message: error.message });
      });
    return () => controller.abort();
  }, [session.token, editing, expenseId, location.state, reload, onSessionExpired]);

  async function save(body) {
    try {
      if (editing) await updateExpense(session.token, expenseId, body);
      else await createExpense(session.token, body);
      navigate('/history?view=koszty', { state: { message: 'Koszt został zapisany.' } });
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      throw error;
    }
  }

  return <>
    <BackLink to="/history?view=koszty">Koszty</BackLink>
    <div className="page-heading"><h1>{editing ? 'Edytuj koszt' : 'Nowy koszt'}</h1></div>
    {result.status === 'loading' && <p role="status">Wczytywanie...</p>}
    {result.status === 'error' && <div>
      <p role="alert" className="text-red-400">{result.message}</p>
      <button type="button" className="button-secondary mt-2" onClick={() => setReload((value) => value + 1)}>Spróbuj ponownie</button>
    </div>}
    {result.status === 'success' && <ExpenseForm shifts={result.shifts} expense={result.expense}
      initialShiftId={location.state?.shiftId} onSubmit={save} onCancel={() => navigate('/history?view=koszty')} />}
  </>;
}
