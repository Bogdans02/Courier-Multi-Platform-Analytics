export function settingsPayload(profiles, netProfile, ppkOptOut, percent) {
  const profile = profiles.find(({ value }) => value === netProfile);
  if (!profile) throw new Error('Wybierz profil szacowanego netto.');
  if (profile.value === 'custom') {
    const value = String(percent).trim().replace(',', '.');
    if (!/^\d+(\.\d{1,3})?$/.test(value) || Number(value) > 100) {
      throw new Error('Podaj szacowaną stawkę potrąceń od 0 do 100%, z najwyżej trzema miejscami po przecinku.');
    }
    return { netProfile, ppkOptOut: null, deductionRate: (Number(value) / 100).toFixed(5) };
  }
  return { netProfile, ppkOptOut: profile.ppkDeductionRate ? ppkOptOut : null };
}

export function estimatedRate(profiles, netProfile, ppkOptOut, percent) {
  try {
    const payload = settingsPayload(profiles, netProfile, ppkOptOut, percent);
    const profile = profiles.find(({ value }) => value === netProfile);
    return payload.deductionRate ?? (profile.ppkDeductionRate && !ppkOptOut
      ? profile.ppkDeductionRate : profile.deductionRate);
  } catch {
    return null;
  }
}

export function formatRate(rate) {
  return `${(Number(rate) * 100).toLocaleString('pl-PL', { maximumFractionDigits: 3 })}%`;
}

// Liczba nieujemna (przecinek dozwolony) z maks. tyloma miejscami po przecinku.
function fuelNumber(value, maxDecimals, field) {
  const text = String(value).trim().replace(',', '.');
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`);
  if (!pattern.test(text)) throw new Error(`Podaj poprawną wartość: ${field}.`);
  return Number(text).toFixed(maxDecimals);
}

// Aktywne platformy: wybrane przez kuriera. Wszystkie zaznaczone = brak filtra (null).
// Pusty wybór jest blokowany w UI, ale pilnujemy tego też tutaj.
export function activePlatformsPayload(selected, allValues) {
  if (!selected.length) throw new Error('Zaznacz przynajmniej jedną platformę.');
  if (selected.length === allValues.length) return { activePlatforms: null };
  return { activePlatforms: allValues.filter((value) => selected.includes(value)) };
}

// Cel dzienny jest opcjonalny: puste pole = brak celu (null), inaczej liczba nieujemna z groszami.
export function dailyGoalPayload(dailyGoal) {
  if (String(dailyGoal).trim() === '') return { dailyGoal: null };
  return { dailyGoal: fuelNumber(dailyGoal, 2, 'cel dzienny (zł)') };
}

// Część transportowa ustawień. Brak typu = brak modelu paliwa. Rower/pieszo nie mają paliwa.
export function transportPayload(types, transportType, fuelPer100km, fuelPricePerL) {
  if (!transportType) return { transportType: null, fuelPer100km: null, fuelPricePerL: null };
  const type = types.find(({ value }) => value === transportType);
  if (!type) throw new Error('Wybierz typ transportu.');
  if (!type.fuel) return { transportType, fuelPer100km: null, fuelPricePerL: null };
  return {
    transportType,
    fuelPer100km: fuelNumber(fuelPer100km, 2, 'spalanie (l/100 km)'),
    fuelPricePerL: fuelNumber(fuelPricePerL, 3, 'cena paliwa (zł/l)'),
  };
}
