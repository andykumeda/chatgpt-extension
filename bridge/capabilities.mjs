// Return only picker metadata; never forward connector configuration or credentials.
export async function capabilities(client, workspace, threadId) {
  const result = { items: [], warnings: [] };
  const sources = await Promise.allSettled([
    client.request('skills/list', { cwds: [workspace], forceReload: true }),
    client.request('plugin/installed', { cwds: [workspace] }),
    (async () => {
      const apps = []; let cursor = null;
      do {
        const page = await client.request('app/list', { cursor, limit: 100, ...(threadId ? { threadId } : {}), forceRefetch: false });
        apps.push(...page.data); cursor = page.nextCursor;
      } while (cursor);
      return apps;
    })(),
  ]);
  for (const [index, source] of sources.entries()) {
    if (source.status === 'rejected') { result.warnings.push(`${['Skills', 'Plugins', 'Apps'][index]} could not be loaded. Reconnect or update the Codex CLI, then refresh.`); continue; }
    if (index === 0) for (const entry of source.value.data) {
      if (entry.errors?.length) result.warnings.push('Some skills could not be loaded. Check them in Codex.');
      result.items.push(...entry.skills.map(skill => ({ kind: 'skill', name: skill.name, label: skill.interface?.displayName || skill.name, path: skill.path, enabled: skill.enabled, description: skill.description })));
    }
    if (index === 1) {
      if (source.value.marketplaceLoadErrors?.length) result.warnings.push('Some plugin marketplaces could not be loaded. Check them in Codex.');
      for (const marketplace of source.value.marketplaces) result.items.push(...marketplace.plugins.filter(plugin => plugin.installed).map(plugin => ({ kind: 'plugin', name: plugin.name, label: plugin.interface?.displayName || plugin.name, path: `plugin://${plugin.id}`, enabled: plugin.enabled && plugin.availability !== 'DISABLED_BY_ADMIN' && !plugin.disabledReason, description: plugin.interface?.shortDescription || '' })));
    }
    if (index === 2) result.items.push(...source.value.filter(app => app.isAccessible).map(app => ({ kind: 'app', name: app.name, label: app.name, path: `app://${app.id}`, enabled: app.isEnabled, description: app.description || '' })));
  }
  return result;
}

export async function capabilityInputs(client, workspace, threadId, selected) {
  if (selected === undefined) return [];
  if (!Array.isArray(selected) || selected.length > 20 || selected.some(path => typeof path !== 'string' || path.length > 8192)) throw new Error('Invalid plugin or skill selection.');
  if (!selected.length) return [];
  const catalog = await capabilities(client, workspace, threadId);
  return [...new Set(selected)].map(path => {
    const item = catalog.items.find(item => item.path === path && item.enabled);
    if (!item) throw new Error('A selected plugin, app or skill is unavailable or disabled. Refresh the picker and choose again.');
    return { type: item.kind === 'skill' ? 'skill' : 'mention', name: item.name, path: item.path };
  });
}
