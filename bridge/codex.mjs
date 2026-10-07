import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';
import path from 'node:path';

export class CodexClient extends EventEmitter {
  constructor({ binary, cwd, state, codexHome, scratch, toolHandler }) {
    super();
    this.pending = new Map();
    this.nextId = 1;
    const overrides = {
      sqlite_home: path.join(state, 'sqlite'), log_dir: path.join(state, 'logs'),
      approval_policy: 'never', sandbox_mode: 'workspace-write',
      'sandbox_workspace_write.writable_roots': [],
      'sandbox_workspace_write.network_access': false,
      'sandbox_workspace_write.exclude_slash_tmp': true,
      'sandbox_workspace_write.exclude_tmpdir_env_var': true,
      'shell_environment_policy.inherit': 'none',
      'shell_environment_policy.set': { HOME: process.env.HOME, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: scratch },
      'features.apps': false, 'features.plugins': false, 'features.hooks': false,
      'features.multi_agent': false,
      'features.shell_snapshot': false, 'features.browser_use': false,
      'features.browser_use_external': false, 'features.computer_use': false,
      'features.in_app_browser': false, 'features.memories': false,
      'features.image_generation': false, 'features.remote_plugin': false,
      web_search: 'disabled', notify: [],
    };
    // TOML inline tables differ from JSON objects; shell env uses individual dotted keys.
    delete overrides['shell_environment_policy.set'];
    for (const [key, value] of Object.entries({ HOME: process.env.HOME, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: scratch })) {
      overrides[`shell_environment_policy.set.${key}`] = value;
    }
    const args = ['app-server', '--listen', 'stdio://'];
    for (const [key, value] of Object.entries(overrides)) args.push('-c', `${key}=${JSON.stringify(value)}`);
    this.child = spawn(binary, args, {
      cwd, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CODEX_HOME: codexHome, CODEX_SQLITE_HOME: path.join(state, 'sqlite'), TMPDIR: scratch, RUST_LOG: 'off' },
    });
    // Never forward raw child stderr, config, account records, or protocol payloads to logs/UI.
    this.child.stderr.resume();
    this.child.stdin.on('error', () => this.fail('Codex connection closed. Reconnect the bridge.'));
    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return this.fail('Codex returned invalid protocol data.'); }
      if (message.id !== undefined && !message.method) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) entry.reject(new Error(message.error.message || 'Codex request failed.'));
        else entry.resolve(message.result);
      } else if (message.id !== undefined) {
        if (message.method === 'item/tool/call' && toolHandler) {
          Promise.resolve().then(() => toolHandler(message.params)).then(
            result => this.child.stdin.write(`${JSON.stringify({ id: message.id, result })}\n`),
            () => this.child.stdin.write(`${JSON.stringify({ id: message.id, result: { success: false, contentItems: [{ type: 'inputText', text: 'Browser tool failed or was denied. Do not retry automatically.' }] } })}\n`),
          ).catch(() => {});
          return;
        }
        // Fail closed: pages cannot authorize approvals, external tools, or auth-token refresh.
        this.child.stdin.write(`${JSON.stringify({ id: message.id, error: { code: -32601, message: 'Unsupported by local side-panel prototype; request denied.' } })}\n`);
        this.emit('denied', message.method);
      } else this.emit('notification', message);
    });
    this.child.on('error', () => this.fail('Cannot launch Codex. Reinstall the native host with the absolute path to a working Codex CLI.'));
    this.child.on('exit', () => this.fail('Codex exited. Reconnect to resume the saved chat.'));
  }

  fail(message) {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(message)); }
    this.pending.clear();
    this.emit('closed', message);
  }

  request(method, params = {}, timeout = 45000) {
    if (this.closed) return Promise.reject(new Error('Codex is disconnected. Reconnect first.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out. Reconnect and check chat history before retrying; the operation may have completed.`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  async initialize(experimentalApi = false) {
    const result = await this.request('initialize', { clientInfo: { name: 'local_codex_sidepanel', title: 'Local Codex Side Panel', version: '0.2.0' }, capabilities: { experimentalApi } });
    this.child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
    return result;
  }

  close() { this.child.kill('SIGTERM'); this.fail('Bridge stopped.'); }
}
