import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
export const project = fileURLToPath(new URL('..', import.meta.url));
export const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const pkg = readJSON(path.join(project, 'package.json'));
export const distribution = readJSON(path.join(project, 'distribution/config.json'));
export function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
export function sha256(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
export function checksum(file) { fs.writeFileSync(`${file}.sha256`, `${sha256(file)}  ${path.basename(file)}\n`); }
export function releaseGuard(development = false) {
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || !Number.isSafeInteger(pkg.buildNumber) || pkg.buildNumber < 1) throw new Error('Invalid release version/build number.');
  if (readJSON(path.join(project, 'extension/manifest.json')).version !== pkg.version) throw new Error('Extension/package versions differ.');
  if (!development && run('git', ['status', '--porcelain']).trim()) throw new Error('Release packaging requires a clean committed checkout. Use --development only for local verification.');
  return run('git', ['rev-parse', 'HEAD']).trim();
}
export function httpsURL(value) {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
}
export function updateFeedForArchitecture(config, arch) {
  if (!['arm64', 'x64'].includes(arch) || typeof config.updateFeedUrl !== 'string' || config.updateFeedUrl.split('{arch}').length !== 2) return null;
  const value = config.updateFeedUrl.replace('{arch}', arch);
  return httpsURL(value) ? value : null;
}
export function updateConfigurationReady(config = distribution) {
  return Boolean(updateFeedForArchitecture(config, 'arm64') && updateFeedForArchitecture(config, 'x64')) && typeof config.sparklePublicKey === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(config.sparklePublicKey) && Buffer.from(config.sparklePublicKey, 'base64').length === 32;
}
export function xml(value) { return String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]); }
export function walk(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
