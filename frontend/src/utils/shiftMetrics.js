import { shiftEarnings } from './earningsMode.js';
import { hourlyRate } from './historySummary.js';
import { fuelCostOf } from './waterfall.js';

// Wskaźniki jednej zmiany. Kwota jak na karcie w Historii: szacowane netto, jeśli jest, inaczej brutto.
// transport (opcjonalny) służy do policzenia kosztu paliwa i kwoty "na rękę" (kwota − paliwo).
export function shiftMetrics(shift, expenses = [], transport = null) {
  const earnings = shiftEarnings(shift, 'auto');
  const cents = Math.round(Number(earnings.amount) * 100);
  const km = shift.distanceKm === null ? 0 : Number(shift.distanceKm);
  // Koszty to tylko te, które kurier sam przypisał do tej zmiany.
  const costCents = expenses.reduce((sum, expense) => sum + Math.round(Number(expense.amount) * 100), 0);
  const afterCosts = (cents - costCents) / 100;
  // Paliwo liczone z dystansu i ustawień transportu; bez nich = 0.
  const fuelCents = Math.round(fuelCostOf(shift.distanceKm, transport) * 100);
  const takeHome = (cents - fuelCents) / 100;
  return {
    amount: cents / 100,
    label: earnings.label,
    perHour: hourlyRate(cents / 100, shift.durationSeconds),
    perOrder: shift.totalOrders > 0 ? cents / 100 / shift.totalOrders : null,
    // Bez podanego dystansu nie ma z czego policzyć zł/km — nie zakładamy zera.
    perKm: km > 0 ? cents / 100 / km : null,
    costs: costCents / 100,
    afterCosts,
    afterCostsPerHour: hourlyRate(afterCosts, shift.durationSeconds),
    fuelCost: fuelCents / 100,
    takeHome,
    takeHomePerHour: hourlyRate(takeHome, shift.durationSeconds),
  };
}

// Zł na zamówienie dla jednej platformy (zawsze brutto, bo tak wpisuje kurier).
export function platformPerOrder(entry) {
  return entry.ordersCount > 0 ? Number(entry.earningsGross) / entry.ordersCount : null;
}
