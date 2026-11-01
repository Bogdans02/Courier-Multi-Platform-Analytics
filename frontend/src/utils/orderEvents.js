import { platforms } from './platformEntries.js';

// Only recorded platforms seed the summary. Earnings remain a manual input.
export function entriesFromOrderEvents(events) {
  return platforms.flatMap(({ value }) => {
    const count = events.filter((event) => event.platform === value).length;
    return count ? [{ platform: value, earningsGross: '', ordersCount: String(count) }] : [];
  });
}

// Manual ordersCount changes never generate or modify timestamps.
export function withOrderEvents(values, draft) {
  return draft?.hasDraft ? { ...values, orderEvents: draft.orderEvents } : values;
}
