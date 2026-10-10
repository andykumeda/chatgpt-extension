import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPanels } from '../extension/connections.js';

const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); }, fire(value) { for (const fn of [...this.listeners]) fn(value); } });
function fixture() {
  const runtime = { id: 'test', getURL: name => `chrome-extension://test/${name}`, onConnect: event() };
  const port = (name = 'local-codex-panel') => ({ name, sender: { id: 'test', url: runtime.getURL('panel.html') }, onMessage: event(), onDisconnect: event(), sent: [], postMessage(message) { this.sent.push(message); }, disconnect() { this.disconnected = true; this.onDisconnect.fire(); } });
  const hosts = [];
  runtime.connectNative = () => { const native = port('native'); hosts.push(native); return native; };
  let id = 0; registerPanels({ runtime }, () => `panel-${++id}`);
  const panel = () => { const value = port(); runtime.onConnect.fire(value); return value; };
  return { runtime, hosts, panel, port };
}

test('multiple panels share one native port and isolate identical request IDs and browser events', () => {
  const f = fixture(); const a = f.panel(); const b = f.panel();
  a.onMessage.fire({ id: 1, method: 'handshake' }); b.onMessage.fire({ id: 1, method: 'handshake' });
  assert.equal(f.hosts.length, 1);
  const host = f.hosts[0]; assert.deepEqual(host.sent.map(m => m.sessionId), ['panel-1', 'panel-2']);
  host.onMessage.fire({ sessionId: 'panel-2', id: 1, result: { ok: true } });
  host.onMessage.fire({ sessionId: 'panel-1', event: 'browserRequest', requestId: 'private' });
  assert.deepEqual(a.sent, [{ event: 'browserRequest', requestId: 'private' }]);
  assert.deepEqual(b.sent, [{ id: 1, result: { ok: true } }]);
  a.disconnect(); assert.equal(host.disconnected, undefined);
  assert.equal(host.sent.at(-1).method, 'session/close');
  b.onMessage.fire({ id: 2, method: 'list' }); assert.equal(host.sent.at(-1).sessionId, 'panel-2');
  b.disconnect(); assert.equal(host.disconnected, true);
  const c = f.panel(); c.onMessage.fire({ id: 1, method: 'handshake' }); assert.equal(f.hosts.length, 2);
});

test('native failure disconnects all panels; legacy hosts and untrusted ports fail closed', () => {
  const f = fixture(); const a = f.panel(); const b = f.panel();
  a.onMessage.fire({ id: 1, method: 'handshake' });
  f.hosts[0].onMessage.fire({ id: 1, result: {} });
  assert.match(a.sent[0].message, /update the native bridge/);
  assert.equal(a.disconnected, true); assert.equal(b.disconnected, true);
  const stranger = f.port(); stranger.sender.url = 'https://evil.example'; f.runtime.onConnect.fire(stranger);
  assert.equal(stranger.disconnected, true);
  assert.equal(f.hosts.length, 1);
});
