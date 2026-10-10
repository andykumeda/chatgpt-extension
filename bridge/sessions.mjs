import { Bridge } from './service.mjs';

export class Sessions {
  constructor(config, emit) {
    this.config = config;
    this.emit = emit;
    this.shared = { sessions: new Set(), loaded: new Set(), owners: new Map(), client: null, store: null };
    this.panels = new Map();
  }

  async handle(message) {
    const id = message.sessionId || 'legacy';
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid panel session.');
    if (message.method === 'session/close') {
      await this.panels.get(id)?.close(); this.panels.delete(id); return {};
    }
    if (!this.panels.has(id)) {
      const send = payload => this.emit(id === 'legacy' ? payload : { ...payload, sessionId: id });
      this.panels.set(id, new Bridge(this.config, send, this.shared));
    }
    return this.panels.get(id).handle(message.method, message.params);
  }

  close() {
    for (const bridge of this.panels.values()) bridge.close();
    this.panels.clear(); this.shared.client?.close();
  }
}
