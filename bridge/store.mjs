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
}
