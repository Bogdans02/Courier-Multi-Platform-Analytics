import { netProfiles, transportTypes, validateSettings, validateTransport, validateDailyGoal } from '../validators/settingsValidator.js';

export function createSettingsService(settings) {
  return {
    async get(userId) {
      return { settings: await settings.get(userId), profiles: netProfiles, transportTypes };
    },
    async save(userId, body) {
      const validated = { ...validateSettings(body), ...validateTransport(body), ...validateDailyGoal(body) };
      return { settings: await settings.save(userId, validated), profiles: netProfiles, transportTypes };
    },
  };
}
