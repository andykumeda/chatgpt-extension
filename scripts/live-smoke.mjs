import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Bridge } from '../bridge/service.mjs';
import { PathPolicy } from '../bridge/paths.mjs';

const policy = new PathPolicy();
const state = policy.create(path.join(process.cwd(), '.runtime/live-smoke'));
const workspace = policy.create(path.join(state, 'workspace'));
const config = { binary: process.env.CODEX_BINARY || '/opt/homebrew/bin/codex', state };
let deltas = 0, completed;
const events = message => {
  if (message.event === 'delta') deltas++;
  if (message.event === 'state' && ['completed', 'error', 'interrupted'].includes(message.status)) completed?.(message);
};
let bridge = new Bridge(config, events);
function waitTurn() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Turn did not complete in 120 seconds.')), 120000);
    completed = message => { clearTimeout(timer); message.status === 'completed' ? resolve(message) : reject(new Error(message.message || message.status)); };
  });
}
try {
  const hello = await bridge.handle('hello'); assert(hello.authenticated);
  console.log('Managed authentication and isolated state verified.');
  await bridge.handle('setWorkspace', { workspace });
  const { chat } = await bridge.handle('new', { workspace });
  const done = waitTurn();
  await bridge.handle('send', { id: chat.id, text: 'Reply in one short sentence with the title and selected text from the attached page. Also remember the marker SIDE_PANEL_742 for my next question. Do not run tools.', page: { url: 'https://example.com/prototype-test', title: 'Prototype Test Page', text: 'A synthetic page for testing.', selectedText: 'selected sample' } });
  await done; assert(deltas > 0);
  assert.match(bridge.store.get(chat.id).messages.at(-1).text, /Prototype Test Page/);
  console.log('New chat, explicit page attachment, streaming and completion verified.');
  bridge.close();
  bridge = new Bridge(config, events);
  const resumed = await bridge.handle('resume', { id: chat.id }); assert.equal(resumed.chat.workspace, workspace);
  const done2 = waitTurn();
  await bridge.handle('send', { id: chat.id, text: 'What marker did I ask you to remember? Reply with only the marker. Do not run tools.' });
  await done2; assert.match(bridge.store.get(chat.id).messages.at(-1).text, /SIDE_PANEL_742/);
  console.log('Bridge restart, chat resume, original workspace and conversation memory verified.');
  const done3 = waitTurn();
  await bridge.handle('send', { id: chat.id, text: 'Create a file named smoke-output.txt in the current workspace containing exactly LOCAL_WORKSPACE_VERIFIED. Do not write any other files. Then reply done.', allowEdits: true });
  await done3; assert.equal(fs.readFileSync(path.join(workspace, 'smoke-output.txt'), 'utf8').trim(), 'LOCAL_WORKSPACE_VERIFIED');
  console.log('File-producing turn wrote into the original workspace.');
  for (const invalid of ['~/Documents/Codex', '~/Library/Mobile Documents/com~apple~CloudDocs/Documents/Codex', path.join(state, 'missing')]) {
    await assert.rejects(bridge.handle('setWorkspace', { workspace: invalid }));
    await assert.rejects(bridge.handle('new', { workspace: invalid }));
  }
  assert.equal(fs.existsSync(path.join(state, 'missing')), false);
  await assert.rejects(bridge.handle('resume', { id: 'not-owned' }));
  console.log('Invalid workspace and cross-extension resume rejection verified.');
  fs.writeFileSync(path.join(state, 'result.json'), JSON.stringify({ passed: true, chatId: chat.id, workspace, deltas, checks: ['authentication', 'isolated-state', 'page-context', 'streaming', 'restart', 'resume-memory', 'workspace-file', 'invalid-paths', 'resume-ownership'] }, null, 2));
} finally { bridge.close(); }
