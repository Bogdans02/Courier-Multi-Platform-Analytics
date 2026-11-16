// Rozkład "na rękę": Brutto − podatek − paliwo − inne koszty = na rękę.
// Liczymy w groszach (liczby całkowite), żeby uniknąć błędów zmiennoprzecinkowych.
// Krok pokazujemy tylko gdy ma dodatnią wartość — brak podatku (brutto), brak paliwa
// (rower/brak km/brak ustawień) czy brak ręcznych kosztów po prostu znika, nie udajemy zera.
// "Inne koszty" to ręczne wydatki bez kategorii paliwa — paliwo już liczy się z km,
// więc backend trzyma je osobno (otherExpenses) i take-home jest już po ich odjęciu.
function toCents(value) {
  return value == null ? null : Math.round(Number(value) * 100);
}

// Koszt paliwa jednej zmiany: km × (spalanie/100) × cena. Taki sam wzór jak w SQL na backendzie.
// Brak dystansu lub ustawień transportu (rower/pieszo też) = 0 zł, nie błąd.
export function fuelCostOf(distanceKm, transport) {
  const km = distanceKm == null ? 0 : Number(distanceKm);
  const perKm = transport?.fuelPer100km == null ? null : Number(transport.fuelPer100km) / 100;
  const price = transport?.fuelPricePerL == null ? null : Number(transport.fuelPricePerL);
  if (km <= 0 || perKm == null || price == null) return 0;
  return km * perKm * price;
}

export function waterfallSteps(summary) {
  const gross = toCents(summary?.grossEarnings);
  const net = toCents(summary?.totalEarnings);
  const fuel = toCents(summary?.fuelCost);
  const other = toCents(summary?.otherExpenses);
  const takeHome = toCents(summary?.takeHome);
  // Bez brutto i "na rękę" nie ma z czego zbudować rozkładu.
  if (gross == null || takeHome == null) return null;

  const tax = net == null ? 0 : gross - net;
  const deductions = [];
  if (tax > 0) deductions.push({ key: 'tax', label: 'Podatek (szac.)', amount: tax / 100 });
  if (fuel != null && fuel > 0) deductions.push({ key: 'fuel', label: 'Paliwo', amount: fuel / 100 });
  if (other != null && other > 0) deductions.push({ key: 'other', label: 'Inne koszty', amount: other / 100 });

  return { gross: gross / 100, deductions, takeHome: takeHome / 100 };
}
