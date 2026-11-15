import { Link } from 'react-router';
import { expenseCategories } from '../utils/expenseValidation.js';
import { formatMoney } from '../utils/shiftFormat.js';
import { formatDate, formatDay } from '../utils/dateFormat.js';

const categoryLabel = (value) => expenseCategories.find((category) => category.value === value)?.label ?? value;

// Jeden koszt w liście: kategoria i kwota w nagłówku, pod spodem data, powiązana zmiana i notatka.
// Edycja otwiera osobny ekran, a nie formularz w środku listy.
export default function ExpenseCard({ expense, shiftDate, confirming, pending, onAskDelete, onCancelDelete, onDelete }) {
  return (
    <li className="card expense-card">
      <div className="expense-card-head">
        <span className="min-w-0">{categoryLabel(expense.category)}</span>
        <strong>{formatMoney(expense.amount)}</strong>
      </div>
      <p className="muted text-xs">{formatDate(expense.expenseDate)}</p>
      <p className="text-xs">{expense.shiftId
        ? (shiftDate
          ? <Link to={`/shifts/${expense.shiftId}`} className="text-link">Zmiana: {formatDay(shiftDate)}</Link>
          : <Link to={`/shifts/${expense.shiftId}`} className="text-link">Powiązana zmiana</Link>)
        : <span className="muted">Bez powiązania ze zmianą</span>}</p>
      {expense.note && <p className="whitespace-pre-wrap break-words text-xs">{expense.note}</p>}
      {confirming
        ? <div className="expense-card-actions">
          <p className="text-xs">Usunąć ten koszt? Tej operacji nie można cofnąć.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => onDelete(expense.id)} className="button-danger">{pending ? 'Usuwanie...' : 'Potwierdź'}</button>
            <button type="button" disabled={pending} onClick={onCancelDelete} className="button-secondary">Anuluj</button>
          </div>
        </div>
        : <div className="expense-card-actions">
          <Link to={`/expenses/${expense.id}/edit`} className="button-secondary">Edytuj</Link>
          <button type="button" disabled={pending} onClick={() => onAskDelete(expense.id)} className="button-danger">Usuń</button>
        </div>}
    </li>
  );
}
