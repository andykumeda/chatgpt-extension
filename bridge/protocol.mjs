import fs from 'node:fs';

export const PROTOCOL_VERSION = 1;
export const MINIMUM_PROTOCOL_VERSION = 1;
export const BRIDGE_VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export function handshake(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Invalid compatibility request. Update the Local Codex extension and companion app, then reconnect.');
  const { protocolVersion, minimumProtocolVersion, extensionVersion } = params;
  if (!Number.isSafeInteger(protocolVersion) || !Number.isSafeInteger(minimumProtocolVersion)
    || minimumProtocolVersion < 1 || minimumProtocolVersion > protocolVersion
    || typeof extensionVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(extensionVersion)) {
    throw new Error('Invalid extension compatibility request. Update the Local Codex extension and companion app, then reconnect.');
  }
  if (protocolVersion < MINIMUM_PROTOCOL_VERSION || minimumProtocolVersion > PROTOCOL_VERSION) {
    throw new Error(`Incompatible Local Codex versions: extension protocol ${minimumProtocolVersion}–${protocolVersion}, bridge protocol ${MINIMUM_PROTOCOL_VERSION}–${PROTOCOL_VERSION}. Update the extension and companion app, reopen the panel, then reconnect.`);
  }
  return { protocolVersion: PROTOCOL_VERSION, minimumProtocolVersion: MINIMUM_PROTOCOL_VERSION, bridgeVersion: BRIDGE_VERSION };
}
