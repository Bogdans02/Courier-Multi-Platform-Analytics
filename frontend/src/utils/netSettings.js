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
