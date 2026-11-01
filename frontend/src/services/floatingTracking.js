import { Capacitor, registerPlugin } from '@capacitor/core';
import { deleteShift } from './api/shifts.js';

const plugin = registerPlugin('FloatingTracking');
const unavailable = { available: false, active: false, hasDraft: false, orderEvents: [] };

export function sessionExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : 0;
  } catch { return 0; }
}

export function createFloatingTracking({ platform = Capacitor, native = plugin } = {}) {
  const available = platform.isNativePlatform() && platform.getPlatform() === 'android';
  return {
    available,
    async canDrawOverlays() { return available ? native.canDrawOverlays() : { granted: false }; },
    async requestOverlayPermission() { if (available) await native.requestOverlayPermission(); },
    async startTracking(session, shiftId) {
      if (!available) return { ...unavailable };
      return native.startTracking({ userId: session.user.id, shiftId, expiresAt: sessionExpiry(session.token) });
    },
    async stopTracking() { if (available) await native.stopTracking(); },
    async getTrackingState(userId, shiftId) {
      return available ? { available: true, ...await native.getTrackingState({ userId, shiftId }) } : { ...unavailable };
    },
    async clearTrackingDraft(userId, shiftId) {
      if (available) await native.clearTrackingDraft({ userId, shiftId });
    },
  };
}

export const floatingTracking = createFloatingTracking();

export async function deleteShiftWithDraft(session, shiftId) {
  await deleteShift(session.token, shiftId);
  await floatingTracking.clearTrackingDraft(session.user.id, shiftId);
}
