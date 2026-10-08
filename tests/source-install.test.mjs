import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { installSource } from '../scripts/source-install.mjs';
const source = fs.realpathSync(new URL('..', import.meta.url));
function fixture(t) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'local-codex-source-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const project = path.join(home, 'Dev/local-codex'); fs.mkdirSync(project, { recursive: true });
  for (const item of ['scripts/install-host.mjs', 'scripts/source-install.mjs', 'scripts/update.mjs', 'package.json', 'extension/manifest.json', '.gitignore']) {
    fs.mkdirSync(path.dirname(path.join(project, item)), { recursive: true }); fs.copyFileSync(path.join(source, item), path.join(project, item));
  }
  fs.cpSync(path.join(source, 'bridge'), path.join(project, 'bridge'), { recursive: true });
  const binary = path.join(home, 'codex'); fs.writeFileSync(binary, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const env = { ...process.env, HOME: home, CODEX_BINARY: binary };
  return { home, project, env };
}
test('source install and repeat preserve state, recovery settings and workspaces', t => {
  const f = fixture(t);
  const first = installSource(f);
  assert(fs.existsSync(first.workspace));
  const body = Buffer.from(JSON.stringify({ id: 1, method: 'handshake', params: { protocolVersion: 1, minimumProtocolVersion: 1, extensionVersion: '0.3.0' } }));
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  const host = spawnSync(JSON.parse(fs.readFileSync(first.hostPath)).path, [`chrome-extension://${first.extensionId}/`], { env: f.env, input: Buffer.concat([header, body]), timeout: 10000 });
  assert.equal(host.status, 0, host.stderr?.toString());
  const response = JSON.parse(host.stdout.subarray(4, 4 + host.stdout.readUInt32LE(0)).toString());
  assert.equal(response.result.bridgeVersion, JSON.parse(fs.readFileSync(path.join(source, 'package.json'))).version);
  const custom = path.join(f.home, 'work'); fs.mkdirSync(custom);
  const index = { version: 1, workspace: custom, chats: [{ id: 'original', workspace: custom }] };
  const history = path.join(first.state, 'chats.json'); fs.writeFileSync(history, JSON.stringify(index));
  const runtimeState = path.join(f.home, 'recovery');
  installSource({ ...f, env: { ...f.env, LOCAL_CODEX_RUNTIME_STATE: runtimeState } });
  const next = installSource(f);
  assert.equal(fs.readFileSync(history, 'utf8'), JSON.stringify(index));
  assert.equal(next.workspace, custom);
  assert.equal(JSON.parse(fs.readFileSync(next.configPath)).runtimeState, runtimeState);
  assert.equal(fs.statSync(next.configPath).mode & 0o777, 0o600);
});
test('source install refuses live host and missing saved workspace without changing registration', t => {
  const f = fixture(t); const installed = installSource(f);
  const before = fs.readFileSync(installed.hostPath, 'utf8');
  const lock = path.join(installed.state, 'bridge.lock'); fs.writeFileSync(lock, String(process.pid));
  assert.throws(() => installSource(f), /Close all/); fs.unlinkSync(lock);
  const missing = path.join(f.home, 'missing-workspace');
  fs.writeFileSync(path.join(installed.state, 'chats.json'), JSON.stringify({ version: 1, workspace: missing, chats: [] }));
  assert.throws(() => installSource(f), /Workspace unavailable/);
  assert.equal(fs.existsSync(missing), false); assert.equal(fs.readFileSync(installed.hostPath, 'utf8'), before);
});
test('source install migrates known registration across folders and rejects unknown hosts before writes', t => {
  const f = fixture(t); const installed = installSource(f);
  const other = path.join(f.home, 'Dev/new-copy'); fs.cpSync(f.project, other, { recursive: true, filter: file => path.basename(file) !== '.runtime' });
  const next = installSource({ ...f, project: other });
  assert.equal(next.state, installed.state);
  const manifest = JSON.parse(fs.readFileSync(next.hostPath)); manifest.allowed_origins.push('chrome-extension://unrelated/'); fs.writeFileSync(next.hostPath, JSON.stringify(manifest));
  const before = fs.readFileSync(next.configPath, 'utf8');
  assert.throws(() => installSource({ ...f, project: other }), /different native host/);
  assert.equal(fs.readFileSync(next.configPath, 'utf8'), before);
});
test('source updater fast-forwards, re-registers and refuses dirty, live and divergent installations', t => {
  const f = fixture(t);
  const run = (args, cwd = f.project) => execFileSync('/usr/bin/git', args, { cwd, env: f.env, encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(f.project, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node --check scripts/source-install.mjs', check: 'node --check scripts/update.mjs' } }));
  run(['init', '-q', '-b', 'main']); run(['add', '.']);
  const commit = message => run(['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Source Test', '-c', 'user.email=source@example.invalid', 'commit', '-qam', message]);
  commit('initial'); const original = run(['rev-parse', 'HEAD']);
  const upstream = path.join(f.home, 'upstream.git'); run(['clone', '-q', '--bare', f.project, upstream]);
  run(['remote', 'add', 'origin', upstream]);
  // Redirect only the origin-inspection output; fetch uses the local bare fixture, never the network.
  const bin = path.join(f.home, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nif [ "$1" = remote ] && [ "$2" = get-url ]; then echo https://github.com/andykumeda/chatgpt-extension.git; else exec /usr/bin/git "$@"; fi\n', { mode: 0o700 });
  const env = { ...f.env, PATH: `${bin}:${process.env.PATH}` };
  const update = () => spawnSync(process.execPath, ['scripts/update.mjs'], { cwd: f.project, env, encoding: 'utf8' });
  const installed = installSource(f);
  fs.writeFileSync(path.join(f.project, 'untracked.txt'), 'user work');
  assert.match(update().stderr, /Local source changes/); fs.unlinkSync(path.join(f.project, 'untracked.txt'));
  const lock = path.join(installed.state, 'bridge.lock'); fs.writeFileSync(lock, String(process.pid));
  assert.match(update().stderr, /Close all/); fs.unlinkSync(lock);
  fs.writeFileSync(path.join(f.project, 'new-version.txt'), 'update'); run(['add', '.']); commit('upstream change'); const newer = run(['rev-parse', 'HEAD']);
  run(['push', '-q', 'origin', 'main']); run(['reset', '--hard', original]);
  const result = update(); assert.equal(result.status, 0, result.stderr); assert.equal(run(['rev-parse', 'HEAD']), newer); assert.match(result.stdout, /click Reload/);
  // Divergence never discards local commits.
  fs.writeFileSync(path.join(f.project, 'local.txt'), 'local'); run(['add', '.']); commit('local work'); const local = run(['rev-parse', 'HEAD']);
  const writer = path.join(f.home, 'writer'); run(['clone', '-q', upstream, writer]);
  fs.writeFileSync(path.join(writer, 'remote.txt'), 'remote'); run(['add', '.'], writer);
  run(['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Source Test', '-c', 'user.email=source@example.invalid', 'commit', '-qm', 'remote work'], writer); run(['push', '-q'], writer);
  assert.notEqual(update().status, 0); assert.equal(run(['rev-parse', 'HEAD']), local);
});
