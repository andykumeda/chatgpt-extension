import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PathPolicy } from '../bridge/paths.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
const development = process.argv.includes('--development');
if (process.argv.slice(2).some(arg => arg !== '--development')) throw new Error('Usage: node scripts/bundle-extension.mjs [--development]');
const git = args => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
if (!development && git(['status', '--porcelain'])) throw new Error('Commit source changes before release packaging; use --development only for a local test candidate.');
const { version } = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(project, 'extension/manifest.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(project, 'distribution/config.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version) || manifest.version !== version) throw new Error('Package and extension versions must match.');
// Preserve the public key and existing native-host allowlist identity. Store-assigned ID
// must be verified before publication; stripping a key here could break registration.
if (!manifest.key) throw new Error('A stable extension public key is required.');
const id = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)].map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
if (id !== config.extensionId) throw new Error('Extension public key does not match the registered extension ID.');
const metadata = Object.fromEntries(['appName', 'protocolVersion', 'minimumProtocolVersion', 'chromeWebStoreUrl', 'downloadUrl'].map(key => [key, config[key]]));
const expectedMetadata = `// Public distribution metadata. Keep synchronized with distribution/config.json.\nexport default ${JSON.stringify(metadata, null, 2)};\n`;
if (fs.readFileSync(path.join(project, 'extension/distribution.js'), 'utf8') !== expectedMetadata) throw new Error('Synchronize extension/distribution.js with distribution/config.json before packaging.');
const files = ['manifest.json', 'worker.js', 'panel.html', 'panel.css', 'panel.js', 'capture.js', 'browser.js', 'browser-dom.js', 'mark.svg', 'distribution.js'];
const archiveTime = new Date(Number(git(['log', '-1', '--format=%ct'])) * 1000);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'local-codex-extension-'));
try {
  for (const name of files) {
    const source = path.join(project, 'extension', name);
    if (!fs.lstatSync(source).isFile()) throw new Error(`Expected a regular extension file: ${name}`);
    fs.copyFileSync(source, path.join(stage, name));
    fs.chmodSync(path.join(stage, name), 0o644);
    fs.utimesSync(path.join(stage, name), archiveTime, archiveTime);
  }
  const policy = new PathPolicy();
  const output = policy.create(path.join(project, 'output/releases'));
  const zip = policy.safeFuture(path.join(output, `local-codex-extension-${version}${development ? '-development' : ''}.zip`));
  // zip updates existing archives; remove only the exact output first to prevent stale entries.
  fs.rmSync(zip, { force: true });
  execFileSync('/usr/bin/zip', ['-q', '-X', zip, ...files], { cwd: stage, stdio: 'inherit', env: { ...process.env, TZ: 'UTC' } });
  const hash = createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  fs.writeFileSync(policy.safeFuture(`${zip}.sha256`), `${hash}  ${path.basename(zip)}\n`);
  console.log(`${development ? 'LOCAL DEVELOPMENT CANDIDATE (not a release)' : `Source: ${git(['rev-parse', 'HEAD'])}`}\nExtension ID: ${id}\nBundle: ${zip}\nSHA-256: ${hash}`);
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
