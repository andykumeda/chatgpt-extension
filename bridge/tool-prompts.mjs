import { randomUUID } from 'node:crypto';

export class ToolPrompts {
  constructor(emit) { this.emit = emit; this.pending = new Map(); }

  request(method, params) {
    if (method !== 'mcpServer/elicitation/request' && (!Array.isArray(params.questions) || params.questions.some(question => question.isSecret))) throw new Error('Secret or unsupported tool prompt. Complete authentication in Codex.');
    const requestId = randomUUID();
    const prompt = method === 'mcpServer/elicitation/request'
      ? { mode: params.mode, serverName: params.serverName, message: params.message, schema: params.requestedSchema, url: params.url }
      : { mode: 'questions', questions: params.questions };
    if (JSON.stringify(prompt).length > 100000) throw new Error('Tool prompt is too large.');
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, prompt });
      this.emit({ event: 'toolPrompt', requestId, chatId: params.threadId, prompt });
    });
  }

  respond({ requestId, answers, action, content }) {
    const entry = this.pending.get(requestId);
    if (!entry) throw new Error('Tool prompt is no longer pending or was already answered.');
    let result;
    if (entry.prompt.mode === 'questions') {
      if (!answers || typeof answers !== 'object' || Array.isArray(answers) || JSON.stringify(answers).length > 16000) throw new Error('Invalid tool answers.');
      const validated = {};
      for (const question of entry.prompt.questions) {
        const values = answers[question.id]?.answers;
        if (!Array.isArray(values) || values.some(value => typeof value !== 'string') || values.length > 1) throw new Error('Answer each tool question.');
        validated[question.id] = { answers: values };
      }
      result = { answers: validated };
    } else {
      if (!['accept', 'decline', 'cancel'].includes(action)) throw new Error('Choose Accept, Decline or Cancel.');
      if (action === 'accept' && entry.prompt.mode !== 'url' && (!content || typeof content !== 'object' || Array.isArray(content) || JSON.stringify(content).length > 16000)) throw new Error('Enter a JSON object matching the requested form.');
      result = { action, content: action === 'accept' && entry.prompt.mode !== 'url' ? content : null };
    }
    this.pending.delete(requestId); entry.resolve(result);
    return {};
  }

  cancel() {
    for (const entry of this.pending.values()) entry.reject(new Error('Tool prompt cancelled.'));
    this.pending.clear();
  }
}
