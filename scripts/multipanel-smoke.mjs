// Real native framing and managed Codex authentication; only synthetic test content.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { encode, decoder } from '../bridge/framing.mjs';
import { PathPolicy } from '../bridge/paths.mjs';

const policy = new PathPolicy();
const root = policy.create(path.join(process.cwd(), '.runtime/multipanel-smoke'));
const workspaces = ['a', 'b'].map(name => policy.create(path.join(root, `workspace-${name}`)));
const configPath = policy.safeFuture(path.join(root, 'host-config.json'));
const installed = JSON.parse(fs.readFileSync('.runtime/host-config.json', 'utf8'));
const config = { binary: installed.binary, codexHome: installed.codexHome, extensionId: installed.extensionId, state: root };
fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
let child, nextId = 0;
const pending = new Map(); const states = new Map(); const deltas = new Map();
function start() {
  child = spawn(process.execPath, ['bridge/host.mjs', `chrome-extension://${config.extensionId}/`], { env: { ...process.env, LOCAL_CODEX_CONFIG: configPath }, stdio: ['pipe', 'pipe', 'inherit'] });
  child.stdout.on('data', decoder(message => {
    if (message.event === 'fatal') throw new Error(message.message);
    if (message.id != null) {
      const entry = pending.get(message.id); if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.result);
    }
    if (message.event === 'state') states.set(message.sessionId, message.status);
    if (message.event === 'delta') deltas.set(message.sessionId, (deltas.get(message.sessionId) || '') + message.text);
  }, error => { throw error; }));
}
function request(sessionId, method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 90000);
    pending.set(id, { resolve, reject, timer }); child.stdin.write(encode({ id, sessionId, method, params }));
  });
}
async function finish(session) {
  const deadline = Date.now() + 120000;
  while (!['completed', 'error', 'interrupted'].includes(states.get(session))) {
    if (Date.now() > deadline) throw new Error(`Turn ${session} timed out`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(states.get(session), 'completed');
}
async function shutdown() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve)); child.stdin.end(); await exited;
}
try {
  start();
  for (const session of ['panel-a', 'panel-b']) {
    await request(session, 'handshake', { protocolVersion: 1, minimumProtocolVersion: 1, extensionVersion: '0.3.3' });
    assert.equal((await request(session, 'hello')).authenticated, true);
  }
  const chats = [];
  for (const [index, session] of ['panel-a', 'panel-b'].entries()) chats.push((await request(session, 'new', { workspace: workspaces[index] })).chat);
  for (const [index, session] of ['panel-a', 'panel-b'].entries()) {
    const result = await request(session, 'send', { id: chats[index].id, text: `Run a shell command that waits 8 seconds, then creates output.txt containing exactly PANEL_${index ? 'B' : 'A'} in the current workspace. Do not write other files. Remember the marker MULTIPANEL_${index ? 'B' : 'A'} for later. Reply briefly when finished.`, allowEdits: true });
    states.set(session, result.status);
  }
  assert.equal(states.get('panel-a'), 'running'); assert.equal(states.get('panel-b'), 'running');
  await assert.rejects(request('panel-c', 'resume', { id: chats[0].id }), /another panel/);
  await finish('panel-a'); await finish('panel-b');
  for (const [index, workspace] of workspaces.entries()) assert.equal(fs.readFileSync(path.join(workspace, 'output.txt'), 'utf8'), `PANEL_${index ? 'B' : 'A'}`);
  assert(deltas.get('panel-a')); assert(deltas.get('panel-b'));
  console.log('Two concurrent native sessions streamed and wrote into their distinct original workspaces.');
  states.delete('panel-b');
  await request('panel-b', 'send', { id: chats[1].id, text: 'Run sleep 5, then reply exactly PANEL_B_SURVIVES. Do not write files.' });
  await request('panel-a', 'send', { id: chats[0].id, text: 'Run sleep 20, then reply A_WAIT_FINISHED. Do not write files.' });
  await request('panel-a', 'session/close'); await finish('panel-b');
  assert.match(deltas.get('panel-b'), /PANEL_B_SURVIVES/);
  console.log('Closing running panel A preserved panel B running turn and connection.');
  for (const workspace of [path.join(root, 'missing'), '~/Documents/Codex']) await assert.rejects(request('panel-b', 'setWorkspace', { workspace }), /unavailable|forbidden/);
  assert.equal(fs.existsSync(path.join(root, 'missing')), false);
  await shutdown(); start();
  const resumed = await request('panel-restart', 'resume', { id: chats[1].id });
  assert.equal(resumed.chat.workspace, workspaces[1]); states.delete('panel-restart');
  await request('panel-restart', 'send', { id: chats[1].id, text: 'Reply only with the MULTIPANEL marker I asked you to remember. Do not run tools.' });
  await finish('panel-restart'); assert.match(deltas.get('panel-restart'), /MULTIPANEL_B/);
  const index = JSON.parse(fs.readFileSync(path.join(root, 'chats.json')));
  assert(chats.every(chat => index.chats.some(saved => saved.id === chat.id && saved.workspace === chat.workspace)));
  console.log('Native restart/resume preserved both chats, original workspace and memory; invalid workspaces refused.');
} finally { await shutdown(); }
