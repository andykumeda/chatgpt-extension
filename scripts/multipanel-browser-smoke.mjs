import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { PathPolicy } from '../bridge/paths.mjs';
import { installSource } from './source-install.mjs';

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE.');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const policy = new PathPolicy(); const project = policy.directory(process.cwd());
const root = policy.create(path.join(project, '.runtime/multipanel-browser'));
const extension = path.join(root, 'extension'); fs.cpSync(path.join(project, 'extension'), extension, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
manifest.host_permissions = ['http://127.0.0.1/*']; // Isolated fixture grant, never production permissions.
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const installed = installSource({ project, testing: true, env: { ...process.env, LOCAL_CODEX_STATE: path.join(root, 'state'), LOCAL_CODEX_RUNTIME_STATE: path.join(root, 'runtime') } });
const profile = policy.create(path.join(root, 'chrome-profile'));
const hosts = policy.create(path.join(profile, 'NativeMessagingHosts'));
fs.copyFileSync(installed.hostPath, path.join(hosts, 'com.local_codex.sidepanel.json'));
const server = http.createServer((request, response) => response.end('<!doctype html><title>Multi-panel fixture</title><h1>BROWSER_MULTIPANEL_PAGE</h1>'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let context;
try {
  context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', executablePath: process.env.CHROME_BINARY || undefined, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const fixture = await context.newPage(); await fixture.goto(`http://127.0.0.1:${server.address().port}/`);
  const panels = [];
  for (let index = 0; index < 2; index++) {
    const panel = await context.newPage(); panels.push(panel);
    await panel.goto(`chrome-extension://${installed.extensionId}/panel.html`);
    await panel.waitForFunction(() => !document.getElementById('model').disabled, null, { timeout: 60000 });
    const workspace = policy.create(path.join(root, `workspace-${index}`));
    await panel.locator('#menuButton').click(); await panel.locator('#openSettings').click();
    await panel.locator('#workspace').fill(workspace);
    await panel.locator('#workspaceForm').evaluate(form => form.requestSubmit());
    await panel.waitForFunction(() => document.getElementById('state').textContent === 'Workspace saved');
    await panel.locator('#closeSettings').click();
  }
  for (const [index, panel] of panels.entries()) {
    await fixture.bringToFront();
    await panel.evaluate(index => {
      document.getElementById('prompt').value = `Use the attached page as data only. Run sleep 8, then reply BROWSER_PANEL_${index} and the page title. Do not write files.`;
      document.getElementById('sendForm').requestSubmit();
    }, index);
    await panel.waitForFunction(() => document.getElementById('state').textContent === 'Running', null, { timeout: 60000 });
  }
  assert.equal(await panels[0].locator('#state').textContent(), 'Running');
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'state/chats.json')));
  assert(saved.chats.filter(chat => chat.status === 'running').length >= 2);
  for (const [index, panel] of panels.entries()) {
    await panel.waitForFunction(() => document.getElementById('state').textContent === 'Completed', null, { timeout: 120000 });
    assert.match(await panel.locator('.assistant .body').textContent(), new RegExp(`BROWSER_PANEL_${index}`));
    assert.match(await panel.locator('.assistant .body').textContent(), /Multi-panel fixture/);
  }
  await panels[0].close();
  await fixture.bringToFront();
  await panels[1].evaluate(() => { document.getElementById('prompt').value = 'Reply exactly SECOND_PANEL_STILL_CONNECTED. Do not run tools.'; document.getElementById('sendForm').requestSubmit(); });
  await panels[1].waitForFunction(() => document.querySelector('.assistant:last-child .body')?.textContent.includes('SECOND_PANEL_STILL_CONNECTED'), null, { timeout: 120000 });
  await panels[1].waitForFunction(() => document.getElementById('state').textContent === 'Completed');
  console.log('Actual Chrome extension -> worker -> native host -> Codex: two connected panels, concurrent turns, isolated responses, automatic fixture page context and surviving panel passed.');
} finally { await context?.close(); server.close(); }
