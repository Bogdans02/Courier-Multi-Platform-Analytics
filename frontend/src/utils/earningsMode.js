export function defaultEarningsMode(settings) {
  return settings.netProfile != null && settings.deductionRate != null ? 'estimated_net' : 'gross';
}

// A missing estimate must never be presented as netto or turned into a zero.
export function shiftEarnings(shift, mode = 'auto') {
  const net = mode !== 'gross' && shift.estimatedNetEarnings != null;
  return {
    amount: net ? shift.estimatedNetEarnings : shift.totalEarnings,
    label: net ? 'szac. netto' : 'brutto',
  };
}
