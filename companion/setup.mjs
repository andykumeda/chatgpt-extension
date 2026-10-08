import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PathPolicy } from '../bridge/paths.mjs';

const resources = fileURLToPath(new URL('..', import.meta.url));
const packageVersion = JSON.parse(fs.readFileSync(path.join(resources, 'package.json'), 'utf8')).version;
const distribution = JSON.parse(fs.readFileSync(path.join(resources, 'distribution/config.json'), 'utf8'));
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const home = path.resolve(option('--home') || os.homedir());
const support = path.join(home, 'Library/Application Support/Local Codex');
const configPath = path.join(support, 'host-config.json');
const manifestPath = path.join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts', `${distribution.hostName}.json`);
const appPath = path.join(home, 'Applications/Local Codex.app');
const bundledApp = path.resolve(resources, '../..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = file => fs.existsSync(file);
const executable = file => { try { fs.accessSync(file, fs.constants.X_OK); return path.isAbsolute(file) && fs.statSync(file).isFile(); } catch { return false; } };
const origins = [`chrome-extension://${distribution.extensionId}/`];
function knownManifest(manifest) {
  return manifest.name === distribution.hostName && manifest.type === 'stdio' && JSON.stringify(manifest.allowed_origins) === JSON.stringify(origins) && path.isAbsolute(manifest.path);
}
function priorConfig(manifest) {
  if (manifest?.path === path.join(appPath, 'Contents/MacOS/native-host')) {
    if (!exists(configPath)) throw new Error('Registered companion configuration is missing.');
    return read(configPath);
  }
  if (!manifest) return exists(configPath) ? read(configPath) : {};
  if (!knownManifest(manifest)) throw new Error('A different native host registration exists. It was not overwritten.');
  // Only migrate the exact source-installer shell format, never execute or source it.
  const launcher = fs.readFileSync(manifest.path, 'utf8');
  const match = launcher.match(/^#!\/bin\/sh\nexport LOCAL_CODEX_CONFIG='((?:[^']|'\\'')*)'\nexec '[^\n]+' '[^\n]+\/bridge\/host\.mjs' "\$@"\n$/);
  if (!match) throw new Error('Unrecognized native launcher. Existing registration was preserved.');
  const previousPath = match[1].replaceAll("'\\''", "'");
  const previous = read(previousPath);
  if (previous.extensionId !== distribution.extensionId) throw new Error('Existing host belongs to a different extension.');
  return previous;
}
function liveLock(state) {
  const lock = path.join(state, 'bridge.lock');
  if (!exists(lock)) return false;
  const pid = Number(fs.readFileSync(lock, 'utf8').trim());
  if (!Number.isSafeInteger(pid) || pid < 1) return true;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function detectBinary(previous) {
  const explicit = option('--codex');
  if (explicit) { if (!executable(explicit)) throw new Error('Choose an absolute, executable Codex CLI path.'); return explicit; }
  const candidates = [previous.binary, path.join(home, '.local/bin/codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex', '/Applications/Codex.app/Contents/Resources/codex'];
  return candidates.find(value => value && executable(value)) || null;
}
function inspect() {
  const manifest = exists(manifestPath) ? read(manifestPath) : null;
  if (manifest && !knownManifest(manifest)) throw new Error('A different native host registration exists. It was not overwritten.');
  const previous = priorConfig(manifest);
  const state = previous.state ?? path.join(home, '.codex/local-sidepanel');
  const codexHome = previous.codexHome ?? path.join(home, '.codex');
  const policy = new PathPolicy(home);
  for (const managed of [state, codexHome, previous.runtimeState].filter(Boolean)) policy.safeFuture(managed);
  if (![state, codexHome, previous.runtimeState].filter(Boolean).every(value => typeof value === 'string' && path.isAbsolute(value))) throw new Error('Existing host paths are invalid.');
  const codexPath = detectBinary(previous);
  const auth = codexPath ? spawnSync(codexPath, ['login', 'status'], { env: { ...process.env, HOME: home, CODEX_HOME: codexHome }, stdio: 'ignore', timeout: 10000 }) : null;
  return { previous, manifest, state, codexHome, codexPath, authenticated: auth?.status === 0, busy: liveLock(state), registered: manifest?.path === path.join(appPath, 'Contents/MacOS/native-host'), appInstalled: exists(appPath), chromeWebStoreUrl: distribution.chromeWebStoreUrl, updateReady: Boolean(distribution.updateFeedUrl && distribution.sparklePublicKey) };
}
function atomicJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, file);
}
function install(status) {
  if (status.busy) throw new Error('Close the Chrome side panel before installing or registering. A native host is running.');
  if (!status.codexPath) throw new Error('Install the Codex CLI or choose its executable before connecting Chrome.');
  const policy = new PathPolicy(home);
  for (const managed of [status.state, status.codexHome, status.previous.runtimeState, support, manifestPath, appPath].filter(Boolean)) policy.safeFuture(managed);
  const indexPath = path.join(status.state, 'chats.json');
  policy.safeFuture(indexPath);
  const fresh = !exists(indexPath);
  let workspace;
  if (fresh) {
    workspace = path.join(home, '.codex/Codex');
    policy.safeFuture(workspace);
  } else {
    const index = read(indexPath);
    if (index.version !== 1 || !Array.isArray(index.chats)) throw new Error('Unsupported chat index. Existing state was preserved.');
    workspace = policy.directory(index.workspace);
  }
  if (args.includes('--copy-app') && bundledApp !== appPath) {
    if (!exists(path.join(bundledApp, 'Contents/MacOS/LocalCodex'))) throw new Error('Run this installer from the packaged Local Codex app.');
    if (exists(appPath)) {
      const info = spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(appPath, 'Contents/Info.plist')], { encoding: 'utf8' });
      if (info.status !== 0 || info.stdout.trim() !== distribution.bundleIdentifier) throw new Error('Another app exists at the installation path. It was preserved.');
    }
    fs.mkdirSync(path.dirname(appPath), { recursive: true });
    const staging = `${appPath}.${process.pid}.staging`;
    const backup = `${appPath}.${process.pid}.backup`;
    fs.cpSync(bundledApp, staging, { recursive: true, dereference: false, verbatimSymlinks: true });
    try {
      if (liveLock(status.state)) throw new Error('The native host started during installation. Close the panel and retry.');
      if (exists(appPath)) fs.renameSync(appPath, backup);
      fs.renameSync(staging, appPath);
      fs.rmSync(backup, { recursive: true, force: true });
    } catch (error) { if (exists(backup) && !exists(appPath)) fs.renameSync(backup, appPath); fs.rmSync(staging, { recursive: true, force: true }); throw error; }
  }
  const launcher = path.join(appPath, 'Contents/MacOS/native-host');
  if (!executable(launcher)) throw new Error('Install the packaged app in ~/Applications before registering Chrome.');
  if (liveLock(status.state)) throw new Error('Close the Chrome side panel before registering.');
  policy.create(status.codexHome);
  policy.create(status.state);
  if (status.previous.runtimeState) policy.create(status.previous.runtimeState);
  if (fresh) policy.create(workspace);
  atomicJSON(configPath, { ...status.previous, binary: status.codexPath, codexHome: status.codexHome, state: status.state, extensionId: distribution.extensionId, appVersion: packageVersion });
  atomicJSON(manifestPath, { name: distribution.hostName, description: 'Local Codex companion', path: launcher, type: 'stdio', allowed_origins: origins });
}
try {
  if (!['status', 'install'].includes(args[0])) throw new Error('Use status --json or install --json.');
  let status = inspect();
  if (args[0] === 'install') { install(status); status = inspect(); }
  const { previous, manifest, ...publicStatus } = status;
  console.log(JSON.stringify(publicStatus));
} catch (error) { console.log(JSON.stringify({ error: error.message })); process.exitCode = 1; }
