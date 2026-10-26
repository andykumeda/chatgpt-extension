import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(root, policy) {
    this.root = policy.directory(root);
    this.policy = policy;
    this.file = path.join(root, 'chats.json');
    this.policy.safeFuture(this.file);
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Chat index cannot be read. Preserve chats.json and repair its permissions or JSON; no index was overwritten.');
      this.data = { version: 1, workspace: '~/.codex/Codex', chats: [] };
    }
    if (this.data.version !== 1 || !Array.isArray(this.data.chats)) throw new Error('Unsupported chat index.');
    for (const chat of this.data.chats) {
      if (['running', 'starting'].includes(chat.status)) chat.status = 'interrupted';
    }
  }

  save() {
    this.policy.directory(this.root);
    this.policy.safeFuture(this.file);
    const temporary = path.join(this.root, `chats-${process.pid}.tmp`);
    fs.writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, this.file);
  }

  get(id) {
    const chat = this.data.chats.find(chat => chat.id === id);
    if (!chat) throw new Error('This chat was not created by this extension. Import is not supported.');
    return chat;
  }

  summaries() {
    return this.data.chats.map(({ id, title, workspace, status }) => ({ id, title, workspace, status }));
  }

  search(query, offset = 0) {
    if (typeof query !== 'string' || query.length > 500) throw new Error('Search must be at most 500 characters.');
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid search offset.');
    const needle = query.trim();
    if (!needle) return { results: [], total: 0, nextOffset: null };
    const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
    const matches = [];
    for (const chat of this.data.chats) {
      const fields = [['Title', chat.title]];
      for (const message of chat.messages) {
        fields.push([message.role === 'assistant' ? 'Codex' : 'You', message.text]);
        if (message.page) for (const key of ['title', 'url', 'text', 'selectedText']) fields.push(['Page context', message.page[key]]);
      }
      for (const [source, text] of fields) {
        if (typeof text !== 'string') continue;
        const index = text.search(pattern);
        if (index < 0) continue;
        const start = Math.max(0, index - 70), end = Math.min(text.length, index + needle.length + 100);
        matches.push({ id: chat.id, title: chat.title, source, snippet: `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}` });
        break;
      }
    }
    // Keep each native response bounded even when every saved chat matches.
    return { results: matches.slice(offset, offset + 20), total: matches.length, nextOffset: offset + 20 < matches.length ? offset + 20 : null };
  }
}
