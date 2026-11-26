import { httpError } from '../utils/httpError.js';

// Parameters of the simplified estimate accepted in DEC-022.
export const netProfiles = [
  { value: 'student_under_26', label: 'Student / uczeń do 26 lat', deductionRate: '0.00000' },
  { value: 'employed_under_26', label: 'Pracuję gdzie indziej i mam mniej niż 26 lat', deductionRate: '0.09000' },
  { value: 'unemployed_under_26', label: 'Nie pracuję nigdzie i mam mniej niż 26 lat',
    deductionRate: '0.19250', ppkDeductionRate: '0.21250' },
  { value: 'employed_26_plus', label: 'Pracuję gdzie indziej, 26 lat lub więcej', deductionRate: '0.18720' },
  { value: 'unemployed_26_plus', label: 'Nie pracuję nigdzie, 26 lat lub więcej',
    deductionRate: '0.27820', ppkDeductionRate: '0.29820' },
  { value: 'custom', label: 'Inny / własna stawka' },
];

// Typy transportu. Rower i pieszo nie mają kosztu paliwa (fuel = false), więc krok paliwa = 0.
export const transportTypes = [
  { value: 'car', label: 'Samochód', fuel: true },
  { value: 'scooter', label: 'Skuter', fuel: true },
  { value: 'motorcycle', label: 'Motocykl', fuel: true },
  { value: 'bike', label: 'Rower', fuel: false },
  { value: 'foot', label: 'Pieszo', fuel: false },
];

// Liczba nieujemna z maks. tyloma miejscami po przecinku. Zwraca znormalizowany string albo rzuca błąd.
function fuelNumber(value, maxDecimals, field) {
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`);
  if (!['string', 'number'].includes(typeof value) || !pattern.test(String(value)) || Number(value) < 0) {
    throw httpError(400, `Podaj poprawną wartość pola: ${field}.`);
  }
  return Number(value).toFixed(maxDecimals);
}

// Transport jest opcjonalny. Brak typu = brak modelu paliwa (wszystkie pola null).
// Pojazd spalinowy wymaga spalania i ceny; rower/pieszo nie przyjmują żadnego z nich.
export function validateTransport(body) {
  const type = body?.transportType ?? null;
  if (type === null || type === '') {
    return { transportType: null, fuelPer100km: null, fuelPricePerL: null };
  }
  const transport = transportTypes.find(({ value }) => value === type);
  if (!transport) throw httpError(400, 'Wybierz poprawny typ transportu.');
  if (!transport.fuel) {
    if (body.fuelPer100km != null || body.fuelPricePerL != null) {
      throw httpError(400, 'Ten środek transportu nie zużywa paliwa.');
    }
    return { transportType: type, fuelPer100km: null, fuelPricePerL: null };
  }
  return {
    transportType: type,
    fuelPer100km: fuelNumber(body.fuelPer100km, 2, 'spalanie (l/100 km)'),
    fuelPricePerL: fuelNumber(body.fuelPricePerL, 3, 'cena paliwa (zł/l)'),
  };
}

// Kanoniczne platformy. Kolejność ustala kolejność zapisu aktywnych platform.
export const platformValues = ['glovo', 'bolt_food', 'uber_eats', 'pyszne_pl', 'wolt', 'other'];

// Aktywne platformy są opcjonalne. Brak / wszystkie / puste = null (= wszystkie aktywne, bez konfiguracji).
// Inaczej: podzbiór kanonicznych bez duplikatów, przynajmniej jedna, w kanonicznej kolejności.
export function validateActivePlatforms(body) {
  const value = body?.activePlatforms;
  if (value === null || value === undefined) return { activePlatforms: null };
  if (!Array.isArray(value)) throw httpError(400, 'Wybierz przynajmniej jedną platformę.');
  const selected = new Set();
  for (const platform of value) {
    if (!platformValues.includes(platform) || selected.has(platform)) {
      throw httpError(400, 'Wybierz przynajmniej jedną platformę.');
    }
    selected.add(platform);
  }
  if (selected.size === 0) throw httpError(400, 'Wybierz przynajmniej jedną platformę.');
  // Wszystkie platformy aktywne = brak filtra, więc zapisujemy null (spójnie z domyślnym stanem).
  if (selected.size === platformValues.length) return { activePlatforms: null };
  return { activePlatforms: platformValues.filter((platform) => selected.has(platform)) };
}

// Cel dzienny jest opcjonalny. Brak (null/'') = cel nie ustawiony; inaczej liczba nieujemna z groszami.
export function validateDailyGoal(body) {
  const goal = body?.dailyGoal;
  if (goal === null || goal === undefined || goal === '') return { dailyGoal: null };
  return { dailyGoal: fuelNumber(goal, 2, 'cel dzienny (zł)') };
}

export function validateSettings(body) {
  const profile = netProfiles.find(({ value }) => value === body?.netProfile);
  if (!profile) throw httpError(400, 'Wybierz poprawny profil szacowanego netto.');
  let deductionRate = profile.deductionRate;
  let ppkOptOut = null;
  if (profile.ppkDeductionRate) {
    if (typeof body.ppkOptOut !== 'boolean') {
      throw httpError(400, 'Określ, czy rezygnujesz z PPK.');
    }
    ppkOptOut = body.ppkOptOut;
    deductionRate = ppkOptOut ? profile.deductionRate : profile.ppkDeductionRate;
  }
  if (profile.value === 'custom') {
    const rate = body.deductionRate;
    if (!['string', 'number'].includes(typeof rate)
      || !/^\d+(\.\d{1,5})?$/.test(String(rate)) || Number(rate) < 0 || Number(rate) > 1) {
      throw httpError(400, 'Podaj szacowaną stawkę potrąceń od 0 do 100%, z najwyżej trzema miejscami po przecinku.');
    }
    deductionRate = Number(rate).toFixed(5);
  }
  return { netProfile: profile.value, deductionRate, ppkOptOut };
}
