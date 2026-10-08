import test from 'node:test';
import assert from 'node:assert/strict';
import { handshake, BRIDGE_VERSION } from '../bridge/protocol.mjs';
import { Bridge } from '../bridge/service.mjs';

const request = { protocolVersion: 1, minimumProtocolVersion: 1, extensionVersion: '0.3.0' };

test('protocol accepts overlapping version ranges and reports actual package version', () => {
  assert.deepEqual(handshake(request), { protocolVersion: 1, minimumProtocolVersion: 1, bridgeVersion: BRIDGE_VERSION });
  assert.equal(handshake({ ...request, protocolVersion: 2 }).protocolVersion, 1);
});

test('protocol rejects incompatible and malformed requests with update guidance', () => {
  assert.throws(() => handshake({ ...request, protocolVersion: 2, minimumProtocolVersion: 2 }), /Incompatible.*Update/);
  for (const invalid of [null, {}, [], { ...request, protocolVersion: 0 }, { ...request, minimumProtocolVersion: 2 }, { ...request, protocolVersion: 1.5 }, { ...request, minimumProtocolVersion: -1 }, { ...request, extensionVersion: 'invalid' }]) {
    assert.throws(() => handshake(invalid), /Update|Invalid/);
  }
});

test('early bridge handshake never reads workspace, store, or initializes Codex', async () => {
  const bridge = Object.create(Bridge.prototype);
  bridge.config = { appVersion: '0.1.0' };
  for (const key of ['store', 'policy', 'client']) Object.defineProperty(bridge, key, { get() { throw new Error(`Unexpected ${key} access`); } });
  bridge.connect = () => assert.fail('Codex must not initialize');
  assert.deepEqual(await bridge.handle('handshake', request), { protocolVersion: 1, minimumProtocolVersion: 1, bridgeVersion: BRIDGE_VERSION, appVersion: BRIDGE_VERSION });
  await assert.rejects(bridge.handle('handshake', { ...request, minimumProtocolVersion: 2, protocolVersion: 2 }), /Incompatible/);
  bridge.config.appVersion = 'untrusted';
  assert.equal('appVersion' in await bridge.handle('handshake', request), false);
});
