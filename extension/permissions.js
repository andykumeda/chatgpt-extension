export const PAGE_ORIGINS = ['http://*/*', 'https://*/*'];

export class GlobalAccess {
  constructor(api) { this.api = api; }
  async mode() {
    const { globalAccess } = await this.api.storage.local.get('globalAccess');
    if (globalAccess?.mode === 'permanent') return 'permanent';
    const { globalAccessSession } = await this.api.storage.session.get('globalAccessSession');
    return globalAccess?.mode === 'session' && globalAccessSession ? 'session' : 'off';
  }
  async reconcile() {
    const { globalAccess } = await this.api.storage.local.get('globalAccess');
    const { globalAccessSession } = await this.api.storage.session.get('globalAccessSession');
    if (globalAccess?.mode !== 'session' || globalAccessSession) return;
    // Chrome optional host permissions persist; remove only broad grants owned by this lease.
    const origins = (globalAccess.ownedOrigins || []).filter(origin => PAGE_ORIGINS.includes(origin));
    if (origins.length && !await this.api.permissions.remove({ origins })) throw new Error('Session website access could not be revoked. Revoke it in Chrome extension settings.');
    await this.api.storage.local.remove('globalAccess');
  }
  async actionsEnabled() {
    if (await this.mode() === 'off') return false;
    const { globalAccess } = await this.api.storage.local.get('globalAccess');
    return globalAccess?.autoActions === true && await this.api.permissions.contains({ origins: PAGE_ORIGINS });
  }
  async save(mode, autoActions = false) {
    if (!['session', 'permanent'].includes(mode)) throw new Error('Choose session or permanent access.');
    await this.api.storage.session.set({ globalAccessSession: true });
    await this.api.storage.local.set({ globalAccess: { mode, ownedOrigins: PAGE_ORIGINS, autoActions: autoActions === true } });
  }
  async revoke() {
    if (!await this.api.permissions.remove({ origins: PAGE_ORIGINS })) throw new Error('Chrome did not revoke website access.');
    await this.api.storage.local.remove('globalAccess');
    await this.api.storage.session.remove('globalAccessSession');
  }
}
