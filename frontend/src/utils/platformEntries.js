export const platforms = [
  { value: 'glovo', label: 'Glovo' },
  { value: 'bolt_food', label: 'Bolt Food' },
  { value: 'uber_eats', label: 'Uber Eats' },
  { value: 'pyszne_pl', label: 'Pyszne.pl' },
  { value: 'wolt', label: 'Wolt' },
  { value: 'other', label: 'Inne' },
];

export function validatePlatformEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > platforms.length) {
    return 'Dodaj od jednej do sześciu platform.';
  }
  const selected = new Set();
  for (const entry of entries) {
    if (!platforms.some(({ value }) => value === entry.platform)) return 'Wybierz poprawną platformę.';
    if (selected.has(entry.platform)) return 'Każda platforma może wystąpić tylko raz w zmianie.';
    selected.add(entry.platform);
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(entry.earningsGross)) {
      return 'Podaj nieujemny zarobek, maksymalnie z dwoma miejscami po przecinku.';
    }
    if (!/^\d+$/.test(entry.ordersCount) || Number(entry.ordersCount) > 2147483647) {
      return 'Liczba zamówień musi być nieujemną liczbą całkowitą do 2147483647.';
    }
  }
  return '';
}

export function platformTotals(entries) {
  const earningsCents = entries.reduce((sum, entry) => sum + (
    /^\d{1,10}(\.\d{1,2})?$/.test(entry.earningsGross) ? Math.round(Number(entry.earningsGross) * 100) : 0
  ), 0);
  const totalOrders = entries.reduce((sum, entry) => sum + (
    /^\d+$/.test(entry.ordersCount) && Number(entry.ordersCount) <= 2147483647 ? Number(entry.ordersCount) : 0
  ), 0);
  return { totalEarnings: (earningsCents / 100).toFixed(2), totalOrders };
}
