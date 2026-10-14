import { netProfiles, validateSettings } from '../validators/settingsValidator.js';

export function createSettingsService(settings) {
  return {
    async get(userId) {
      return { settings: await settings.get(userId), profiles: netProfiles };
    },
    async save(userId, body) {
      return { settings: await settings.save(userId, validateSettings(body)), profiles: netProfiles };
    },
  };
}
