// Rozkład "na rękę": Brutto − podatek − paliwo = na rękę.
// Liczymy w groszach (liczby całkowite), żeby uniknąć błędów zmiennoprzecinkowych.
// Krok pokazujemy tylko gdy ma dodatnią wartość — brak podatku (brutto) czy brak paliwa
// (rower/brak km/brak ustawień) po prostu znika, nie udajemy zera.
function toCents(value) {
  return value == null ? null : Math.round(Number(value) * 100);
}

export function waterfallSteps(summary) {
  const gross = toCents(summary?.grossEarnings);
  const net = toCents(summary?.totalEarnings);
  const fuel = toCents(summary?.fuelCost);
  const takeHome = toCents(summary?.takeHome);
  // Bez brutto i "na rękę" nie ma z czego zbudować rozkładu.
  if (gross == null || takeHome == null) return null;

  const tax = net == null ? 0 : gross - net;
  const deductions = [];
  if (tax > 0) deductions.push({ key: 'tax', label: 'Podatek (szac.)', amount: tax / 100 });
  if (fuel != null && fuel > 0) deductions.push({ key: 'fuel', label: 'Paliwo', amount: fuel / 100 });

  return { gross: gross / 100, deductions, takeHome: takeHome / 100 };
}
