import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { PathPolicy, sandboxPolicy } from '../bridge/paths.mjs';
import { CodexClient } from '../bridge/codex.mjs';

const policy = new PathPolicy();
const cwd = policy.directory(process.cwd());
const state = policy.create(path.join(cwd, '.runtime/probe'));
const workspace = policy.create(path.join(state, 'workspace'));
const scratch = policy.create(path.join(workspace, '.tmp'));
const codexHome = policy.directory(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const client = new CodexClient({ binary: process.env.CODEX_BINARY || '/opt/homebrew/bin/codex', cwd: workspace, state, codexHome, scratch });
try {
  const initialized = await client.initialize();
  console.log('Initialized:', initialized.userAgent);
  const account = await client.request('account/read', { refreshToken: false });
  console.log('Authentication:', account.account?.type || 'not signed in');
  assert(account.account || !account.requiresOpenaiAuth, 'Run codex login first.');
  const safe = await client.request('command/exec', {
    command: ['/bin/sh', '-c', 'printf verified > connectivity.txt'], cwd: workspace, sandboxPolicy: sandboxPolicy(workspace),
  });
  assert.equal(safe.exitCode, 0, safe.stderr);
  assert.equal(fs.readFileSync(path.join(workspace, 'connectivity.txt'), 'utf8'), 'verified');
  const forbidden = path.join(os.homedir(), 'Documents', 'local-codex-sidepanel-denial-probe.txt');
  assert(!fs.existsSync(forbidden), 'Probe filename already exists; refusing to touch it.');
  const blocked = await client.request('command/exec', {
    command: ['/usr/bin/touch', forbidden], cwd: workspace, sandboxPolicy: sandboxPolicy(workspace),
  });
  assert.notEqual(blocked.exitCode, 0);
  assert(!fs.existsSync(forbidden));
  console.log('Sandbox: workspace write succeeded; Documents write denied without creating a file.');
  const outside = policy.create(path.join(state, 'outside'));
  const alias = path.join(workspace, 'escape');
  if (!fs.existsSync(alias)) fs.symlinkSync(outside, alias);
  const escaped = await client.request('command/exec', {
    command: ['/usr/bin/touch', path.join(alias, 'should-not-exist')], cwd: workspace, sandboxPolicy: sandboxPolicy(workspace),
  });
  assert.notEqual(escaped.exitCode, 0); assert(!fs.existsSync(path.join(outside, 'should-not-exist')));
  const readOnly = await client.request('command/exec', {
    command: ['/bin/sh', '-c', 'printf denied > readonly.txt'], cwd: workspace, sandboxPolicy: { type: 'readOnly' },
  });
  assert.notEqual(readOnly.exitCode, 0); assert(!fs.existsSync(path.join(workspace, 'readonly.txt')));
  console.log('Sandbox: symlink write escape and read-only writes denied.');
  console.log('Default workspace:', policy.directory('~/.codex/Codex'));
} finally { client.close(); }
