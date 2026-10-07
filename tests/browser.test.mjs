import test from 'node:test';
import assert from 'node:assert/strict';
import { browserOperation, BrowserRequests } from '../bridge/browser.mjs';
import { browserURL, LiveBrowser } from '../extension/browser.js';
import { Bridge } from '../bridge/service.mjs';

test('browser tool accepts only bounded named operations, never arbitrary scripts or credential URLs', () => {
  assert.deepEqual(browserOperation({ operation: 'read' }), { operation: 'read' });
  for (const args of [{ operation: 'eval', code: 'x' }, { operation: 'read', code: 'x' }, { operation: 'fill', snapshot: 's', ref: 'e1', text: 'x'.repeat(4001) }, { operation: 'scroll', snapshot: 's', dy: 2001 }, { operation: 'navigate', url: 'file:///tmp/a' }, { operation: 'navigate', url: 'https://user:secret@example.com' }]) assert.throws(() => browserOperation(args));
  assert.throws(() => browserURL('chrome://settings'));
  assert.throws(() => browserURL('https://example.com/export.zip'));
});

test('browser replies correlate once, stay bounded, timeout and cancel without retries', async () => {
  const messages = [], requests = new BrowserRequests(message => messages.push(message), 20);
  const response = requests.request('chat', { operation: 'read' });
  assert.throws(() => requests.respond({ requestId: 'wrong', success: true, result: {} }), /expired/);
  requests.respond({ requestId: messages[0].requestId, success: true, result: { text: 'untrusted' } });
  assert.equal((await response).success, true);
  assert.throws(() => requests.respond({ requestId: messages[0].requestId, success: true, result: {} }), /expired/);
  const cancelled = requests.request('chat', {}); requests.cancel(); await assert.rejects(cancelled, /stopped/);
  await assert.rejects(requests.request('chat', {}), /expired/);
});

function fixture() {
  let tab = { id: 42, url: 'https://example.com/page', title: 'Test' }, count = 0;
  const calls = [];
  const api = { tabs: { get: async id => { assert.equal(id, 42); return tab; }, update: async (id, args) => { calls.push(args); tab = { ...tab, url: args.url }; } }, permissions: { contains: async () => false }, scripting: { executeScript: async args => {
    calls.push(args);
    return [{ documentId: 'document-1', result: args.args[0].operation === 'read' ? { snapshot: `s${++count}`, url: tab.url, elements: [{ ref: 'e1', label: 'Name' }] } : { done: true } }];
  } } };
  return { api, calls, move: url => { tab = { ...tab, url }; } };
}

test('live executor pins a tab, requires action approval, binds document and consumes refs', async () => {
  const { api, calls } = fixture(), browser = new LiveBrowser(api);
  await assert.rejects(browser.run({ operation: 'read' }), /disabled/);
  await browser.enable({ id: 42, url: 'https://example.com/page' });
  await assert.rejects(browser.run({ operation: 'click', snapshot: 's1', ref: 'e1' }), /declined/);
  await browser.run({ operation: 'fill', snapshot: 's1', ref: 'e1', text: 'Sample' }, async () => true);
  assert.deepEqual(calls.at(-1).target, { tabId: 42, documentIds: ['document-1'] });
  await assert.rejects(browser.run({ operation: 'click', snapshot: 's1', ref: 'e1' }, async () => true), /Stale/);
});

test('navigation, origin grants and revocation fail closed around approvals', async () => {
  const { api, calls, move } = fixture(), browser = new LiveBrowser(api);
  await browser.enable({ id: 42, url: 'https://example.com/page' });
  await assert.rejects(browser.run({ operation: 'navigate', url: 'https://other.example/' }, async details => { assert.equal(details.requestOrigin, 'https://other.example/*'); return true; }), /permission/);
  await assert.rejects(browser.run({ operation: 'click', snapshot: 's1', ref: 'e1' }, async () => { browser.disable(); return true; }), /revoked/);
  await browser.enable({ id: 42, url: 'https://example.com/page' });
  move('https://other.example/');
  await assert.rejects(browser.run({ operation: 'read' }), /unapproved/);
  assert.equal(calls.filter(call => call.url).length, 0);
});

test('bridge browser grant is scoped to the active thread/turn and stop revokes pending tools', async () => {
  const bridge = Object.create(Bridge.prototype);
  const emitted = [];
  bridge.browser = new BrowserRequests(message => emitted.push(message));
  const params = { tool: 'local_browser', threadId: 'chat', turnId: 'turn', arguments: { operation: 'read' } };
  assert.throws(() => bridge.browserTool(params), /not enabled/);
  bridge.active = { chat: { id: 'chat' }, assistant: { turnId: 'turn' }, allowBrowser: false };
  assert.throws(() => bridge.browserTool(params), /not enabled/);
  bridge.active.allowBrowser = true;
  for (const changed of [{ threadId: 'other' }, { turnId: 'other' }, { tool: 'shell' }, { namespace: 'other' }]) assert.throws(() => bridge.browserTool({ ...params, ...changed }), /not enabled/);
  const pending = bridge.browserTool(params);
  bridge.client = { request: async method => { assert.equal(method, 'turn/interrupt'); return {}; } };
  await bridge.handle('stop');
  await assert.rejects(pending, /stopped/);
  assert.equal(bridge.active.allowBrowser, false);
  assert.equal(bridge.browser.pending.size, 0);
});
