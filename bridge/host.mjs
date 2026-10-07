import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bridge } from './service.mjs';
import { PathPolicy } from './paths.mjs';
import { encode, decoder } from './framing.mjs';

const send = message => process.stdout.write(encode(message));
const configPath = process.env.LOCAL_CODEX_CONFIG || fileURLToPath(new URL('../.runtime/host-config.json', import.meta.url));
let bridge;
let lock;
let queued = Promise.resolve();
function shutdown() {
  bridge?.close();
  if (lock) { try { fs.unlinkSync(lock); } catch {} lock = null; }
}
try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const origin = process.argv[2];
  if (origin !== `chrome-extension://${config.extensionId}/`) throw new Error('This native host only accepts the registered prototype extension.');
  const policy = new PathPolicy();
  const root = policy.create(config.state);
  lock = path.join(root, 'bridge.lock');
  policy.safeFuture(lock);
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = true;
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (alive) { lock = null; throw new Error('The bridge is open in another panel. Close that panel before reconnecting.'); }
    fs.unlinkSync(lock);
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  }
  bridge = new Bridge(config, send);
  const receive = decoder(message => {
    if (!message || !Number.isSafeInteger(message.id) || typeof message.method !== 'string') return;
    const execute = async () => {
      try { send({ id: message.id, result: await bridge.handle(message.method, message.params) }); }
      catch (error) { send({ id: message.id, error: error.message }); }
    };
    // Interrupt must bypass the normal request queue while a slow request is in progress.
    if (message.method === 'stop') void execute(); else queued = queued.then(execute);
  }, () => { shutdown(); process.exit(1); });
  process.stdin.on('data', receive);
  process.stdin.on('end', () => { shutdown(); process.exit(0); });
} catch (error) {
  send({ event: 'fatal', message: error.message });
  shutdown();
  process.exitCode = 1;
}
process.on('SIGTERM', () => { shutdown(); process.exit(0); });
process.on('SIGINT', () => { shutdown(); process.exit(0); });
process.on('exit', shutdown);
