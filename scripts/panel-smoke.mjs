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
  response.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
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
    let listener;
    const noopEvent = { addListener() {} };
    window.chrome = {
      runtime: { getManifest: () => ({ version }), connectNative: () => ({ onMessage: { addListener(fn) { listener = fn; } }, onDisconnect: noopEvent, disconnect() {}, postMessage(message) {
        window.calls.push(message);
        const result = ({ handshake: { protocolVersion: 1, minimumProtocolVersion: 1, bridgeVersion: version }, hello: { workspace: '/local/workspace', authenticated: true }, list: { chats: [] }, models: { models: [
          { model: 'model-a', displayName: '5.6 Sol', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'high' }] },
          { model: 'model-b', displayName: '6 Sol', defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] },
        ] }, new: { chat: { id: 'test-chat', workspace: '/local/workspace' } }, send: { status: 'running' } })[message.method] || {};
        queueMicrotask(() => {
          if (message.method === 'handshake' && sessionStorage.getItem('protocolMode') === 'legacy') { listener({ id: message.id, error: 'Unknown method: handshake' }); return; }
          if (message.method === 'handshake' && sessionStorage.getItem('protocolMode') === 'incompatible') { listener({ id: message.id, result: { protocolVersion: 2, minimumProtocolVersion: 2, bridgeVersion: '1.0.0' } }); return; }
          listener({ id: message.id, result }); if (message.method === 'send') setTimeout(() => listener({ event: 'state', chatId: 'test-chat', status: 'completed' }), 10); });
      } }) },
      tabs: { query: async () => [{ id: 1, title: 'Example', url: window.activeURL || undefined }], onActivated: noopEvent, onUpdated: noopEvent },
      scripting: { executeScript: async () => { if (!window.activeURL) throw new Error('Cannot access a chrome:// URL'); if (window.denyCapture) throw new Error('Access denied'); window.captureCount++; return [{ result: { title: 'Example', url: window.activeURL, text: `Fresh snapshot ${window.captureCount}`, selectedText: '', truncated: false } }]; } },
    };
  }, version);
  await page.goto(`http://127.0.0.1:${server.address().port}/panel.html`);
  await page.waitForFunction(() => !document.getElementById('model').disabled);
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
  await page.evaluate(() => { window.denyCapture = true; });
  await page.locator('#prompt').fill('Do not send stale context');
  await page.locator('#send').click();
  await page.waitForFunction(() => !document.getElementById('error').hidden);
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.method === 'send').length), 1);
  assert.equal(await page.locator('#prompt').inputValue(), 'Do not send stale context');
  await page.evaluate(() => { window.denyCapture = false; });
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
    assert.equal(await page.locator('#pageTitle').textContent(), 'No page attached');
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
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
    assert.equal(await page.locator('#send').isVisible(), true);
    if (width === 320) await page.screenshot({ path: '.runtime/panel-narrow.png' });
  }
  for (const mode of ['legacy', 'incompatible']) {
    await page.evaluate(mode => sessionStorage.setItem('protocolMode', mode), mode);
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('error').hidden);
    assert.equal(await page.evaluate(() => window.calls.some(call => ['hello', 'send'].includes(call.method))), false);
    assert.equal(await page.locator('#send').isDisabled(), true);
    assert.equal(await page.locator('#applyWorkspace').isDisabled(), true);
  }
  assert.deepEqual(errors, []);
  console.log('Panel UI passed: settings, model/effort selection, fresh automatic context, denied capture without send, 320–1440px layouts, restricted tabs allow chat without stale attachments, live browser remains blocked there, compatibility errors prevent startup/send, no page errors.');
} finally { await browser?.close(); server.close(); }
