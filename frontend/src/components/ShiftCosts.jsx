import { Link } from 'react-router';
import { expenseCategories } from '../utils/expenseValidation.js';
import { formatMoney } from '../utils/shiftFormat.js';

const categoryLabel = (value) => expenseCategories.find((category) => category.value === value)?.label ?? value;

// Koszty, które kurier przypisał do tej zmiany, i ile zostaje po ich odjęciu.
export default function ShiftCosts({ shiftId, expenses, status, message, metrics }) {
  return (
    <section className="card" aria-labelledby="shift-costs-title">
      <h2 id="shift-costs-title" className="card-title">Koszty tej zmiany</h2>
      {status === 'loading' && <p role="status">Wczytywanie kosztów...</p>}
      {status === 'error' && <p role="alert">{message}</p>}
      {status === 'success' && (expenses.length === 0
        ? <p className="muted text-sm">Brak kosztów przypisanych do tej zmiany.</p>
        : <ul className="detail-list">
          {expenses.map((expense) => <li key={expense.id}>
            <span className="min-w-0">
              {categoryLabel(expense.category)}
              <small className="muted">{expense.expenseDate.split('-').reverse().join('.')}{expense.note ? ` · ${expense.note}` : ''}</small>
            </span>
            <strong>{formatMoney(expense.amount)}</strong>
          </li>)}
        </ul>)}
      {/* "Po kosztach" tylko dla zmiany z zarobkiem — bez niego nie ma od czego odejmować. */}
      {status === 'success' && expenses.length > 0 && metrics && <dl className="detail-totals">
        <div><dt>Po kosztach ({metrics.label})</dt><dd>{formatMoney(metrics.afterCosts)}</dd></div>
        <div><dt>Po kosztach na godzinę</dt><dd>{metrics.afterCostsPerHour === null ? '—' : `${formatMoney(metrics.afterCostsPerHour)}/h`}</dd></div>
      </dl>}
      <Link to="/expenses/new" state={{ shiftId }} className="button-secondary mt-3 w-full">+ Dodaj koszt</Link>
    </section>
  );
}
