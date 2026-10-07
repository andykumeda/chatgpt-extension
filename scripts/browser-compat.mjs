import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { CodexClient } from '../bridge/codex.mjs';
import { PathPolicy } from '../bridge/paths.mjs';

const policy = new PathPolicy();
const state = policy.create(path.join(process.cwd(), '.runtime/browser-compat'));
const workspace = policy.create(path.join(state, 'workspace'));
const config = {
  binary: execFileSync('which', ['codex'], { encoding: 'utf8' }).trim(), cwd: workspace,
  state, codexHome: policy.directory(path.join(os.homedir(), '.codex')), scratch: policy.create(path.join(state, 'tmp')),
};
let calls = 0;
const tools = [{ type: 'function', name: 'local_browser_probe', description: 'Read a synthetic browser fixture marker for the compatibility test.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }];
const client = new CodexClient({ ...config, toolHandler: params => {
  assert.equal(params.tool, 'local_browser_probe');
  calls++;
  return { success: true, contentItems: [{ type: 'inputText', text: 'Synthetic reference data: BROWSER_TOOL_5831' }] };
} });
let threadId;
const turn = async (connection = client) => {
  let text = '';
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Compatibility turn timed out.')), 120000);
    const listener = ({ method, params }) => {
      if (params?.threadId !== threadId) return;
      if (method === 'item/agentMessage/delta') text += params.delta;
      if (method === 'turn/completed') {
        clearTimeout(timer); connection.off('notification', listener);
        params.turn.status === 'completed' ? resolve() : reject(new Error('Compatibility turn failed.'));
      }
    };
    connection.on('notification', listener);
  });
  await connection.request('turn/start', { threadId, input: [{ type: 'text', text: 'Call local_browser_probe now, then reply with its marker. Do not use any other tools.' }] });
  await done;
  assert.match(text, /BROWSER_TOOL_5831/);
};
try {
  await client.initialize(true);
  ({ thread: { id: threadId } } = await client.request('thread/start', { cwd: workspace, approvalPolicy: 'never', sandbox: 'read-only', dynamicTools: tools }));
  await turn(); assert(calls > 0);
  console.log('Dynamic tool registration, invocation and model result: PASS');
  client.close();
} finally { client.close(); }
const resumed = new CodexClient({ ...config, toolHandler: params => {
  assert.equal(params.tool, 'local_browser_probe'); calls++;
  return { success: true, contentItems: [{ type: 'inputText', text: 'Synthetic reference data: BROWSER_TOOL_5831' }] };
} });
try {
  await resumed.initialize(true);
  const result = await resumed.request('thread/resume', { threadId, cwd: workspace, approvalPolicy: 'never', sandbox: 'read-only' });
  assert.equal(result.thread.cwd, workspace);
  const toolCalls = result.thread.turns.flatMap(t => t.items).filter(i => i.type === 'dynamicToolCall');
  assert(toolCalls.length > 0);
  const before = calls;
  await turn(resumed);
  assert(calls > before);
  fs.writeFileSync(path.join(state, 'result.json'), JSON.stringify({ threadId, calls, resumeHistory: true }));
  console.log('Restart/resume retained definitions, invoked the tool and used its result: PASS');
} finally { resumed.close(); }
