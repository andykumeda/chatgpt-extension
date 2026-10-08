import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
import { project, pkg, distribution, readJSON, run, walk } from './release-utils.mjs';
import { decoder, encode } from '../bridge/framing.mjs';
import { spawn } from 'node:child_process';
const arch = process.argv.find(arg => arg.startsWith('--arch='))?.split('=')[1] || process.arch;
const app = path.join(project, 'output/macos', arch, 'Local Codex.app');
const resources = path.join(app, 'Contents/Resources');
const info = readJSON(path.join(resources, 'build.json'));
assert.equal(info.version, pkg.version); assert.equal(info.architecture, arch);
assert.equal(run('/usr/libexec/PlistBuddy', ['-c', 'Print :LSUIElement', path.join(app, 'Contents/Info.plist')]).trim(), 'true', 'Companion must not appear in the Dock');
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
for (const file of walk(resources)) {
  assert(!/(^|\/)(?:\.runtime|\.env|auth\.json|chats\.json|host-config\.json|node_modules)(\/|$)/.test(path.relative(resources, file)), 'Private/runtime source in app');
}
// Different architecture is a static/signature-only check; do not pretend to run Intel on ARM or vice versa.
if (arch !== process.arch) { console.log(`Verified ${arch} bundle contents and signatures; native execution requires ${arch} Mac.`); process.exit(0); }
const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'local-codex-app-check-')));
try {
  const node = path.join(resources, 'runtime/node');
  const helper = path.join(resources, 'companion/setup.mjs');
  const result = JSON.parse(run(node, [helper, 'status', '--json', '--home', home]));
  assert.equal(result.registered, false); assert.equal(result.appInstalled, false);
  assert(!fs.existsSync(path.join(home, 'Library')), 'Read-only status unexpectedly wrote state');
  const fakeCodex = path.join(home, 'codex-fixture');
  fs.writeFileSync(fakeCodex, '#!/bin/sh\n[ "$1" = "login" ] && exit 0\nexit 1\n', { mode: 0o755 });
  const installed = JSON.parse(run(node, [helper, 'install', '--json', '--home', home, '--codex', fakeCodex, '--copy-app']));
  assert.equal(installed.registered, true);
  const installedApp = path.join(home, 'Applications/Local Codex.app');
  const configPath = path.join(home, 'Library/Application Support/Local Codex/host-config.json');
  const config = readJSON(configPath); assert.equal(config.appVersion, pkg.version);
  const origin = `chrome-extension://${distribution.extensionId}/`;
  const messages = [];
  const child = spawn(path.join(installedApp, 'Contents/MacOS/native-host'), [origin], { env: { ...process.env, HOME: home }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.resume();
  const response = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Packaged native host handshake timed out.')); }, 10000);
    const decode = decoder(message => {
      messages.push(message);
      if (message.id === 1) { clearTimeout(timer); resolve(message); }
      else if (message.event === 'fatal') { clearTimeout(timer); reject(new Error(message.message)); }
    }, reject);
    child.stdout.on('data', decode); child.on('error', reject);
    child.on('exit', code => { if (!messages.length) { clearTimeout(timer); reject(new Error(`Packaged native host exited (${code}).`)); } });
  });
  child.stdin.write(encode({ id: 1, method: 'handshake', params: { protocolVersion: 1, minimumProtocolVersion: 1, extensionVersion: pkg.version } }));
  const reply = await response; child.stdin.end();
  assert(!reply.error, reply.error); assert.equal(reply.result.bridgeVersion, pkg.version); assert.equal(reply.result.appVersion, pkg.version);
  // No Codex inference or credentials are involved in this packaged-host protocol check.
  console.log('Verified packaged app: bundled Node, isolated-home install/copy, native registration, framed native-host handshake and version compatibility.');
} finally { fs.rmSync(home, { recursive: true, force: true }); }
