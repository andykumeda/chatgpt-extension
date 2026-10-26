import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bridge } from '../bridge/service.mjs';
import { encode, MAX_FRAME } from '../bridge/framing.mjs';

function fixture(t) {
  const state = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'local-codex-search-')));
  t.after(() => fs.rmSync(state, { recursive: true, force: true }));
  const events = [];
  const bridge = new Bridge({ state, binary: '/does-not-exist' }, e => events.push(e));
  return { bridge, events };
}

test('search covers title, all message text and captured page fields with literal Unicode phrase matching', async t => {
  const { bridge } = fixture(t);
  const chat = (id, title, messages) => ({ id, title, workspace: '/missing-workspace', messages });
  bridge.store.data.chats = [
    chat('title', 'Old project NEEDLE', []),
    chat('user', 'Question', [{ role: 'user', text: 'needle in a user question' }]),
    chat('assistant', 'Answer', [{ role: 'assistant', text: 'x'.repeat(50000) + 'Needle in an old answer' }]),
    chat('page', 'Webpage', [{ role: 'user', text: 'Unrelated', page: { title: 'needle title', text: 'captured-only', url: 'https://example.test/url-only', selectedText: 'selection-only' } }]),
    chat('literal', 'Special characters', [{ role: 'assistant', text: 'Use [a+b].* literally. CAFÉ 日本語 <script>bad()</script>' }]),
  ];
  const before = JSON.stringify(bridge.store.data);
  assert.deepEqual((await bridge.handle('search', { query: ' nEeDlE ' })).results.map(r => r.id), ['title', 'user', 'assistant', 'page']);
  for (const query of ['captured-only', 'url-only', 'selection-only']) assert.equal(bridge.store.search(query).results[0].id, 'page');
  for (const query of ['[a+b].*', 'café', '日本語', '<script>']) assert.equal(bridge.store.search(query).results[0].id, 'literal');
  assert.equal(bridge.store.search('not present').total, 0);
  assert.equal(bridge.store.search('   ').total, 0);
  assert.equal(bridge.client, null);
  assert.equal(JSON.stringify(bridge.store.data), before);
});

test('search pages every matching chat and validates native input without returning full transcripts', t => {
  const { bridge } = fixture(t);
  bridge.store.data.chats = Array.from({ length: 45 }, (_, i) => ({ id: String(i), title: `Chat ${i}`, messages: [{ role: 'assistant', text: 'prefix '.repeat(10000) + 'needle' + ' suffix'.repeat(10000) }] }));
  const ids = []; let offset = 0;
  do {
    const result = bridge.store.search('needle', offset);
    assert.equal(result.total, 45);
    assert(result.results.length <= 20);
    assert(encode(result).length < MAX_FRAME);
    assert(result.results.every(r => r.snippet.length < 200 && r.messages === undefined));
    ids.push(...result.results.map(r => r.id)); offset = result.nextOffset;
  } while (offset !== null);
  assert.equal(new Set(ids).size, 45);
  for (const query of [null, {}, 42, 'x'.repeat(501)]) assert.throws(() => bridge.store.search(query), /500 characters/);
  for (const offset of [-1, 0.5, '20', Infinity]) assert.throws(() => bridge.store.search('needle', offset), /offset/);
});

test('saved previews need no provider or workspace and stream all messages/pages in bounded chunks without altering history', async t => {
  const { bridge, events } = fixture(t);
  const text = 'saved answer '.repeat(4000), page = 'captured page '.repeat(3000);
  bridge.store.data.chats = [{ id: 'legacy', title: 'Legacy', workspace: '/missing', status: 'completed', messages: [{ role: 'user', text: 'Question', page: { title: 'Page title', url: 'https://example.test', text: page, selectedText: '' } }, { role: 'assistant', text }] }];
  const before = JSON.stringify(bridge.store.data);
  const result = await bridge.handle('view', { id: 'legacy' });
  assert.equal(result.chat.readOnly, true);
  assert.equal(bridge.client, null);
  assert.equal(bridge.loaded.size, 0);
  assert.equal(events[0].event, 'historyStart');
  assert.equal(events.filter(e => e.message?.role === 'assistant').map(e => e.message.text).join(''), text);
  assert(events.filter(e => e.message?.role === 'reference').map(e => e.message.text).join('').includes(page));
  for (const event of events) assert(encode(event).length < MAX_FRAME);
  assert.equal(JSON.stringify(bridge.store.data), before);
  await assert.rejects(bridge.handle('view', { id: 'not-owned' }), /not created/);
  bridge.active = {};
  await assert.rejects(bridge.handle('view', { id: 'legacy' }), /running turn/);
});
