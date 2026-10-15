export const expenseCategories = [
  { value: 'fuel', label: 'Paliwo' },
  { value: 'vehicle_service', label: 'Serwis / naprawa pojazdu' },
  { value: 'vehicle_rental', label: 'Wynajem pojazdu' },
  { value: 'phone', label: 'Telefon' },
  { value: 'other', label: 'Inne' },
];

function validDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000')
    && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function expensePayload({ category, amount, expenseDate, shiftId, note }) {
  if (!expenseCategories.some(({ value }) => value === category)) throw new Error('Wybierz kategorię kosztu.');
  const normalizedAmount = String(amount).trim().replace(',', '.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalizedAmount)) {
    throw new Error('Podaj nieujemną kwotę kosztu, maksymalnie z dwoma miejscami po przecinku.');
  }
  if (!validDate(expenseDate)) throw new Error('Podaj poprawną datę kosztu.');
  const selectedShift = shiftId === '' || shiftId === null || shiftId === undefined ? null : Number(shiftId);
  if (selectedShift !== null && (!/^\d+$/.test(String(shiftId)) || !Number.isInteger(selectedShift)
    || selectedShift <= 0 || selectedShift > 2147483647)) throw new Error('Wybierz poprawną zmianę.');
  return { category, amount: normalizedAmount, expenseDate, shiftId: selectedShift, note: note?.trim() || null };
}

export function validateExpenseFilters(filters) {
  if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to))) {
    throw new Error('Podaj poprawne daty filtrowania.');
  }
  if (filters.from && filters.to && filters.from > filters.to) throw new Error('Data od nie może być późniejsza niż data do.');
  return filters;
}

export function todayDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
