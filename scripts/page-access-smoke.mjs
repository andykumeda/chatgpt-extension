// Real Chrome permission regression in a disposable profile with synthetic local pages only.
// Confirm the two local test-site permissions in Chrome's native prompt; no real sites/accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to playwright/index.mjs.');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
fs.mkdirSync('.runtime', { recursive: true });
const root = fs.mkdtempSync(path.resolve('.runtime/page-access-smoke-'));
const extension = path.join(root, 'extension'); fs.mkdirSync(extension);
const origins = ['http://127.0.0.1/*', 'http://localhost/*'];
const manifest = JSON.parse(fs.readFileSync('extension/manifest.json'));
// This fixture never connects to the native host or accesses any real website.
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({
  manifest_version: 3, name: 'Local Codex page access fixture', version: '1.0.0',
  key: manifest.key, permissions: ['activeTab', 'scripting'], optional_host_permissions: origins,
  background: { service_worker: 'worker.js', type: 'module' },
}));
fs.copyFileSync('extension/capture.js', path.join(extension, 'capture.js'));
fs.writeFileSync(path.join(extension, 'worker.js'), "import { captureActivePage } from './capture.js'; globalThis.captureActivePage = captureActivePage;\n");
fs.writeFileSync(path.join(extension, 'grant.html'), '<button id="grant">Allow test websites</button><script src="grant.js"></script>');
fs.writeFileSync(path.join(extension, 'grant.js'), `document.getElementById('grant').onclick = async () => { try { window.granted = await chrome.permissions.request({origins: ${JSON.stringify(origins)}}); } catch (error) { window.failed = error.message; } };`);
const server = http.createServer((_request, response) => response.end('<title>Permission fixture</title><p>Fresh synthetic page</p>'));
await new Promise(resolve => server.listen(0, resolve));
let context;
try {
  context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
    headless: false, ...(process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE } : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.bringToFront();
  const capture = () => worker.evaluate(async () => {
    try { return { page: await globalThis.captureActivePage() }; }
    catch (error) { return { error: error.message }; }
  });
  const before = await capture();
  assert.match(before.error, /Cannot access contents|permission/i);
  console.log(`Reproduced missing permission: ${before.error}`);
  const grant = await context.newPage(); await grant.goto(`chrome-extension://${id}/grant.html`);
  await grant.locator('#grant').click();
  console.log('Confirm access to the two synthetic local sites in the isolated Chrome test window.');
  await grant.waitForFunction(() => window.granted !== undefined || window.failed, null, { timeout: 60000 });
  assert.equal(await grant.evaluate(() => window.failed), undefined);
  assert.equal(await grant.evaluate(() => window.granted), true);
  await page.bringToFront();
  assert.equal((await capture()).page.url, url);
  const next = `http://localhost:${server.address().port}/next`;
  await page.goto(next);
  assert.equal((await capture()).page.url, next);
  assert.match((await capture()).page.text, /Fresh synthetic page/);
  await page.goto('chrome://extensions');
  assert.equal((await capture()).page, null);
  await page.goto(next);
  await worker.evaluate(origins => chrome.permissions.remove({ origins }), origins);
  assert.match((await capture()).error, /Cannot access contents|permission/i);
  console.log('Real Chrome passed: missing grant reproduces capture failure; explicit optional website grant restores capture across origins; revocation blocks it again. No native host or real page data used.');
} finally { await context?.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
