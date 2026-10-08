import { browserDOM } from './browser-dom.js';

export function browserURL(value) {
  let url;
  try {
    if (typeof value !== 'string' || !value.trim()) throw new Error();
    url = new URL(value);
  } catch {
    throw new Error('A valid absolute HTTP(S) webpage URL is required.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP(S) webpages without embedded credentials are supported.');
  if (/\.(zip|dmg|pkg|exe|msi|crx|pdf|csv|xlsx?|docx?|pptx?|tar|gz|7z)$/i.test(url.pathname)) throw new Error('Browser file downloads are not supported.');
  return url;
}

function tabURL(tab) {
  if (!tab || !Number.isSafeInteger(tab.id)) throw new Error('Select an ordinary webpage first.');
  if (!tab.url) throw new Error('Chrome has not granted access to this tab. Click the Local Codex toolbar icon on the intended webpage, then send again with Live browser this turn enabled. Access must be granted again after switching to another site.');
  return browserURL(tab.url);
}

export class LiveBrowser {
  constructor(api = chrome) { this.api = api; this.target = null; }
  disable() { this.target = null; }
  async enable(tab) {
    this.disable();
    const url = tabURL(tab);
    const target = { tabId: tab.id, origins: new Set([url.origin]), last: null };
    this.target = target;
    try { await this.run({ operation: 'read' }); }
    catch (error) {
      if (this.target === target) this.disable();
      throw new Error(`Cannot enable live browser access. Click the Local Codex toolbar icon on the intended HTTP(S) tab to grant access, then send again. ${error.message}`);
    }
    return { tabId: tab.id, url: url.href, title: tab.title || url.hostname };
  }
  async run(operation, approve = async () => false) {
    const target = this.target;
    if (!target) throw new Error('Live browser access is disabled for this turn.');
    const tab = await this.api.tabs.get(target.tabId);
    const url = tabURL(tab);
    if (!target.origins.has(url.origin)) throw new Error('The tab moved to an unapproved site. Stop, select it and enable browser access again.');
    const last = target.last;
    if (operation.operation !== 'read' && operation.operation !== 'navigate' && (!last || operation.snapshot !== last.snapshot || url.href !== last.url)) throw new Error('Stale page reference. Read the page again.');
    if (['click', 'fill', 'navigate'].includes(operation.operation)) {
      const destination = operation.operation === 'navigate' ? browserURL(operation.url) : null;
      const element = operation.ref ? last.elements.find(item => item.ref === operation.ref) : null;
      if (operation.ref && !element) throw new Error('Unknown element reference. Read again.');
      const approved = await approve({ operation, pageUrl: url.href, element, destination: destination?.href, requestOrigin: destination && !target.origins.has(destination.origin) ? `${destination.origin}/*` : null });
      if (!approved) throw new Error('User declined browser action. Do not retry automatically.');
      if (this.target !== target) throw new Error('Browser access was revoked.');
      const current = await this.api.tabs.get(target.tabId);
      if (current.url !== url.href) throw new Error('The page changed while approval was pending. Read again.');
      if (destination) {
        if (!target.origins.has(destination.origin) && !await this.api.permissions.contains({ origins: [`${destination.origin}/*`] })) throw new Error('Destination website permission was not granted.');
        target.origins.add(destination.origin); target.last = null;
        await this.api.tabs.update(target.tabId, { url: destination.href });
        return { navigated: destination.href, next: 'Read the page again once it finishes loading.' };
      }
    }
    if (this.target !== target) throw new Error('Browser access was revoked.');
    const injectionTarget = operation.operation === 'read' ? { tabId: target.tabId, frameIds: [0] } : { tabId: target.tabId, documentIds: [last.documentId] };
    const [reply] = await this.api.scripting.executeScript({ target: injectionTarget, world: 'ISOLATED', func: browserDOM, args: [operation] });
    if (!reply?.result) throw new Error('The page is unavailable or changed before execution. No automatic retry.');
    if (operation.operation === 'read') {
      const actual = browserURL(reply.result.url);
      if (!target.origins.has(actual.origin)) throw new Error('The tab changed to an unapproved origin during capture.');
      target.last = { ...reply.result, documentId: reply.documentId };
      if (!reply.documentId) throw new Error('Chrome did not return a document identity. Update Chrome.');
    } else if (['click', 'fill'].includes(operation.operation)) target.last = null;
    return reply.result;
  }
}
