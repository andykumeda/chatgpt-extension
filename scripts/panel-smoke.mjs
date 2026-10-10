// UI integration check with synthetic Chrome/native-host responses; no real page/chat data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to playwright/index.mjs.');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const server = http.createServer((request, response) => {
  const name = path.basename(new URL(request.url, 'http://localhost').pathname);
  const file = path.join(process.cwd(), 'extension', name || 'panel.html');
  if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.png') ? 'image/png' : 'text/html');
  response.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 722, height: 988 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(version => {
    window.calls = []; window.captureCount = 0; window.denyCapture = false; window.activeURL = 'https://example.com';
    window.pageAccess = false; window.grantPageAccess = false; window.permissionRequests = [];
    window.copiedText = null;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { if (window.denyClipboard) throw new Error('Clipboard denied'); window.copiedText = text; } } });
    let permissionsRemoved;
    let listener;
    window.nativeEvent = event => listener(event);
    const noopEvent = { addListener() {} };
    const area = name => ({ get: async key => ({ [key]: JSON.parse(sessionStorage.getItem(name) || '{}')[key] }), set: async values => sessionStorage.setItem(name, JSON.stringify({ ...JSON.parse(sessionStorage.getItem(name) || '{}'), ...values })), remove: async key => { const data = JSON.parse(sessionStorage.getItem(name) || '{}'); delete data[key]; sessionStorage.setItem(name, JSON.stringify(data)); } });
    window.chrome = {
      storage: { local: area('settingsLocal'), session: area('settingsSession') },
      permissions: {
        contains: async () => window.pageAccess,
        request: async request => { window.permissionRequests.push(request); window.pageAccess = window.grantPageAccess; return window.pageAccess; },
        remove: async () => { window.pageAccess = false; return true; },
        onAdded: noopEvent, onRemoved: { addListener(fn) { permissionsRemoved = fn; } },
      },
      runtime: { getManifest: () => ({ version }), connect: () => ({ onMessage: { addListener(fn) { listener = fn; } }, onDisconnect: noopEvent, disconnect() {}, postMessage(message) {
        window.calls.push(message);
        const result = ({ handshake: { protocolVersion: 1, minimumProtocolVersion: 1, bridgeVersion: version }, hello: { workspace: '/local/workspace', authenticated: true }, list: { chats: [] }, models: { models: [
          { model: 'model-a', displayName: '5.6 Sol', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'high' }] },
          { model: 'model-b', displayName: '6 Sol', defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] },
        ] }, new: { chat: { id: 'test-chat', workspace: '/local/workspace' } }, send: { status: 'running' } })[message.method] || {};
        queueMicrotask(() => {
          if (message.method === 'handshake' && sessionStorage.getItem('protocolMode') === 'panel-conflict') { listener({ id: message.id, error: 'The bridge is open in another panel. Close that panel before reconnecting.' }); return; }
          if (message.method === 'handshake' && sessionStorage.getItem('protocolMode') === 'legacy') { listener({ id: message.id, error: 'Unknown method: handshake' }); return; }
          if (message.method === 'handshake' && sessionStorage.getItem('protocolMode') === 'incompatible') { listener({ id: message.id, result: { protocolVersion: 2, minimumProtocolVersion: 2, bridgeVersion: '1.0.0' } }); return; }
          listener({ id: message.id, result }); if (message.method === 'send' && !window.holdTurn) setTimeout(() => { listener({ event: 'delta', chatId: 'test-chat', itemId: 'answer', text: 'Streamed response' }); listener({ event: 'delta', chatId: 'test-chat', itemId: 'answer', text: '\nFinal text' }); listener({ event: 'state', chatId: 'test-chat', status: 'completed' }); }, 10); });
      } }) },
      tabs: { query: async () => [{ id: 1, title: 'Example', url: window.activeURL || undefined }], get: async () => ({ id: 1, url: window.activeURL }), onActivated: noopEvent, onUpdated: noopEvent },
      scripting: { executeScript: async args => { if (!window.activeURL) throw new Error('Cannot access a chrome:// URL'); if (window.denyCapture || (window.needsPageAccess && !window.pageAccess)) throw new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.'); window.captureCount++; return [{ documentId: 'document-1', result: { title: 'Example', url: window.activeURL, text: `Fresh snapshot ${window.captureCount}`, selectedText: '', truncated: false, snapshot: 'browser-snapshot', elements: [{ ref: 'e1', label: 'Ordinary button' }] } }]; } },
    };
    window.revokePageAccess = () => { window.pageAccess = false; permissionsRemoved(); };
  }, version);
  await page.goto(`http://127.0.0.1:${server.address().port}/panel.html`);
  await page.waitForFunction(() => !document.getElementById('model').disabled);
  await page.waitForFunction(() => document.querySelector('#empty .brand-mark')?.naturalWidth === 128);
  assert.equal(await page.evaluate(() => window.calls[0].method), 'handshake');
  assert.equal(await page.locator('#settingsDialog').isVisible(), false);
  assert.equal(await page.locator('#workspace').isVisible(), false);
  await page.locator('#menuButton').click();
  await page.screenshot({ path: '.runtime/panel-desktop.png' });
  await page.locator('#openSettings').click();
  assert.equal(await page.locator('#workspace').isVisible(), true);
  assert.equal(await page.locator('#bridgeVersion').textContent(), version);
  assert.equal(await page.locator('#downloadLink').isVisible(), false);
  assert.equal(await page.locator('#storeLink').isVisible(), false);
  await page.locator('#closeSettings').click();
  await page.locator('#model').selectOption('model-b');
  assert.equal(await page.locator('#effort').inputValue(), 'high');
  await page.locator('#prompt').fill('Summarize this page');
  const before = await page.evaluate(() => window.captureCount);
  await page.locator('#send').click();
  await page.waitForFunction(() => window.calls.some(call => call.method === 'send'));
  const sent = await page.evaluate(() => window.calls.find(call => call.method === 'send').params);
  assert.equal(sent.model, 'model-b'); assert.equal(sent.effort, 'high');
  assert.equal(sent.page.text, `Fresh snapshot ${before + 1}`);
  await page.waitForFunction(() => document.getElementById('state').textContent === 'Completed');
  assert.equal(await page.locator('#attachment').count(), 0);
  assert.equal(await page.locator('.source').count(), 0);
  await page.locator('.copy-output').first().click();
  assert.equal(await page.evaluate(() => window.copiedText), 'Streamed response\nFinal text');
  await page.evaluate(() => { window.denyClipboard = true; });
  await page.locator('.copy-output').first().click();
  await page.waitForFunction(() => document.getElementById('error').textContent.includes('Could not copy'));
  await page.evaluate(() => { window.denyClipboard = false; });
  await page.evaluate(() => {
    window.nativeEvent({ event: 'historyStart' });
    window.nativeEvent({ event: 'historyMessage', message: { role: 'assistant', text: 'Resumed response', page: { title: 'Example' } } });
    window.nativeEvent({ event: 'historyMessage', append: true, message: { text: '\nContinued history' } });
  });
  await page.locator('.copy-output').click();
  assert.equal(await page.evaluate(() => window.copiedText), 'Resumed response\nContinued history');
  assert.equal(await page.locator('.source').count(), 0);
  await page.evaluate(() => { window.denyCapture = true; });
  await page.locator('#prompt').fill('Do not send stale context');
  await page.locator('#send').click();
  await page.waitForFunction(() => !document.getElementById('error').hidden);
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === 'send').length), 1);
  assert.equal(await page.locator('#prompt').inputValue(), 'Do not send stale context');
  await page.evaluate(() => { window.denyCapture = false; });
  // A new site's missing grant preserves the draft; only an explicit settings click requests access.
  await page.evaluate(() => { window.needsPageAccess = true; window.activeURL = 'https://other.example/'; });
  await page.locator('#send').click();
  await page.waitForFunction(() => !document.getElementById('error').hidden);
  assert.match(await page.locator('#error').textContent(), /enable global website access/);
  assert.equal(await page.evaluate(() => window.permissionRequests.length), 0);
  await page.locator('#menuButton').click(); await page.locator('#openSettings').click();
  await page.locator('#enablePageAccess').click();
  await page.waitForFunction(() => document.getElementById('pageAccessStatus').textContent.includes('not granted'));
  assert.equal(await page.locator('#prompt').inputValue(), 'Do not send stale context');
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === 'send').length), 1);
  await page.evaluate(() => { window.grantPageAccess = true; });
  await page.locator('#enablePageAccess').click();
  await page.waitForFunction(() => document.getElementById('pageAccessStatus').textContent.includes('enabled'));
  assert.deepEqual(await page.evaluate(() => window.permissionRequests.at(-1)), { origins: ['http://*/*', 'https://*/*'] });
  assert.equal(await page.locator('#enablePageAccess').isDisabled(), false);
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('settingsLocal')).globalAccess.mode), 'session');
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === 'send').length), 1);
  assert.equal(await page.locator('#prompt').inputValue(), 'Do not send stale context');
  for (const width of [320, 722]) {
    await page.setViewportSize({ width, height: 988 });
    assert.equal(await page.evaluate(() => document.getElementById('settingsDialog').scrollWidth <= innerWidth), true, `settings overflow at ${width}px`);
  }
  await page.screenshot({ path: '.runtime/page-access-settings.png' });
  await page.locator('#closeSettings').click();
  const beforeGrantSend = await page.evaluate(() => window.captureCount);
  await page.locator('#send').click();
  await page.waitForFunction(() => window.calls.filter(call => call.method === 'send').length === 2);
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === 'send').at(-1).params.page.url), 'https://other.example/');
  assert.equal(await page.evaluate(() => window.captureCount), beforeGrantSend + 1);
  await page.waitForFunction(() => document.getElementById('state').textContent === 'Completed');
  await page.evaluate(() => { window.revokePageAccess(); window.needsPageAccess = false; });
  await page.waitForFunction(() => !document.getElementById('enablePageAccess').disabled);
  await page.locator('#newChat').evaluate(button => button.click());
  for (const url of ['chrome://extensions', 'chrome://settings', 'chrome://newtab/', 'https://chromewebstore.google.com/detail/test', null]) {
    await page.evaluate(url => { window.activeURL = url; }, url);
    const captures = await page.evaluate(() => window.captureCount);
    const sends = await page.evaluate(() => window.calls.filter(call => call.method === 'send').length);
    await page.locator('#prompt').fill('A normal chat without a webpage');
    await page.locator('#send').click();
    await page.waitForFunction(count => window.calls.filter(call => call.method === 'send').length === count + 1, sends);
    assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === 'send').at(-1).params.page), null);
    assert.equal(await page.evaluate(() => window.captureCount), captures);
    assert.equal(await page.locator('#currentPageStatus').textContent(), 'No webpage context on this tab.');
    await page.waitForFunction(() => document.getElementById('state').textContent === 'Completed');
  }
  await page.locator('#allowBrowser').evaluate(input => { input.checked = true; });
  const sends = await page.evaluate(() => window.calls.filter(call => call.method === 'send').length);
  await page.locator('#prompt').fill('Cannot run live browser on internal pages');
  await page.locator('#send').click();
  await page.waitForFunction(() => !document.getElementById('error').hidden);
  assert.match(await page.locator('#error').textContent(), /Live browser access needs an HTTP/);
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === 'send').length), sends);
  assert.equal(await page.locator('#prompt').inputValue(), 'Cannot run live browser on internal pages');
  await page.locator('#allowBrowser').evaluate(input => { input.checked = false; });
  await page.evaluate(() => { window.activeURL = 'https://example.com/returned'; });
  await page.locator('#send').click();
  await page.waitForFunction(count => window.calls.filter(call => call.method === 'send').length === count + 1, sends);
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === 'send').at(-1).params.page.url), 'https://example.com/returned');
  await page.waitForFunction(() => document.getElementById('state').textContent === 'Completed');
  await page.locator('#prompt').fill('');
  // Session/permanent consent also gates live actions; no approval UI under explicit opt-in.
  await page.locator('#menuButton').click(); await page.locator('#openSettings').click();
  await page.evaluate(() => { window.grantPageAccess = true; window.holdTurn = true; });
  await page.locator('#permissionDuration').selectOption('permanent');
  await page.locator('#autoBrowserActions').check();
  await page.locator('#enablePageAccess').click();
  await page.waitForFunction(() => document.getElementById('pageAccessStatus').textContent.includes('permanently'));
  await page.locator('#closeSettings').click();
  await page.locator('#prompt').fill('Click the ordinary test button'); await page.locator('#send').click();
  await page.waitForFunction(() => document.getElementById('state').textContent === 'Running');
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === 'send').at(-1).params.allowBrowser), true);
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === 'send').at(-1).params.allowEdits), false);
  await page.evaluate(() => window.nativeEvent({ event: 'browserRequest', chatId: 'test-chat', requestId: 'auto-action', operation: { operation: 'click', snapshot: 'browser-snapshot', ref: 'e1' } }));
  await page.waitForFunction(() => window.calls.some(call => call.method === 'browserResult' && call.params.requestId === 'auto-action'));
  assert.equal(await page.evaluate(() => window.calls.find(call => call.method === 'browserResult' && call.params.requestId === 'auto-action').params.success), true);
  assert.equal(await page.locator('#browserApproval').isVisible(), false);
  await page.evaluate(() => window.nativeEvent({ event: 'state', chatId: 'test-chat', status: 'completed' }));
  await page.locator('#menuButton').click(); await page.locator('#openSettings').click();
  await page.locator('#revokePageAccess').click();
  await page.waitForFunction(() => document.getElementById('pageAccessStatus').textContent.includes('off'));
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('settingsLocal')).globalAccess), undefined);
  await page.locator('#closeSettings').click();
  await page.evaluate(() => { window.holdTurn = false; });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
    assert.equal(await page.locator('#send').isVisible(), true);
    if (width === 320) await page.screenshot({ path: '.runtime/panel-narrow.png' });
  }
  for (const mode of ['legacy', 'incompatible', 'panel-conflict']) {
    await page.evaluate(mode => sessionStorage.setItem('protocolMode', mode), mode);
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('error').hidden);
    assert.equal(await page.evaluate(() => window.calls.some(call => ['hello', 'send'].includes(call.method))), false);
    assert.equal(await page.locator('#send').isDisabled(), true);
    assert.equal(await page.locator('#applyWorkspace').isDisabled(), true);
    if (mode === 'panel-conflict') {
      const message = await page.locator('#error').textContent();
      assert.match(message, /different Chrome window/);
      assert.doesNotMatch(message, /could not confirm compatibility|install\.sh|codex login|npm run update/);
      await page.evaluate(() => sessionStorage.removeItem('protocolMode'));
      await page.locator('#menuButton').click(); await page.locator('#openSettings').click();
      await page.locator('#connect').click();
      await page.waitForFunction(() => !document.getElementById('model').disabled);
      assert.equal(await page.locator('#error').isVisible(), false);
    }
  }
  assert.deepEqual(errors, []);
  console.log('Panel UI passed: no attachment label/page picker; streamed/resumed response copying and clipboard errors; session/permanent website preferences, opt-in action bypass, revocation and separate workspace edits; draft preserved without automatic send, fresh cross-site context, model/effort selection, 320–1440px layouts, restricted tabs allow chat without stale attachments, compatibility errors prevent startup/send, no page errors.');
} finally { await browser?.close(); server.close(); }
