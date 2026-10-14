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
