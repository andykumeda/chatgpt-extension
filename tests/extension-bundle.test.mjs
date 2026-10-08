import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('extension archive contains its module/resource graph and is reproducible across checkout metadata', t => {
  const project = fs.realpathSync(new URL('..', import.meta.url));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-codex-bundle-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Package a synthetic committed fixture; never change the working repository.
  for (const item of ['package.json', 'extension', 'distribution/config.json', 'scripts/bundle-extension.mjs', 'bridge/paths.mjs']) {
    fs.mkdirSync(path.dirname(path.join(root, item)), { recursive: true });
    fs.cpSync(path.join(project, item), path.join(root, item), { recursive: true });
  }
  const run = (command, args, env = {}) => execFileSync(command, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  run('git', ['init', '-q']);
  run('git', ['add', '.']);
  run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Bundle Test', '-c', 'user.email=bundle-test@example.invalid', 'commit', '-q', '-m', 'Synthetic packaging fixture']);
  run(process.execPath, ['scripts/bundle-extension.mjs', '--development'], { TZ: 'Pacific/Honolulu' });
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const zip = path.join(root, 'output/releases', `local-codex-extension-${version}-development.zip`);
  const hash = () => createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  const first = hash();
  const files = run('/usr/bin/unzip', ['-Z1', zip]).trim().split('\n');
  assert(files.includes('browser-dom.js'));
  assert(files.every(file => !file.includes('/') && !file.startsWith('.')));
  for (const file of files) {
    const content = run('/usr/bin/unzip', ['-p', zip, file]);
    if (file.endsWith('.js')) {
      for (const match of content.matchAll(/\b(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
        assert(files.includes(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]))), `${file} is missing module ${match[1]}`);
      }
    }
    if (file.endsWith('.html')) {
      for (const match of content.matchAll(/\b(?:src|href)="([^":]+)"/g)) assert(files.includes(match[1]), `${file} is missing resource ${match[1]}`);
    }
    fs.chmodSync(path.join(root, 'extension', file), 0o600);
    fs.utimesSync(path.join(root, 'extension', file), new Date(), new Date());
  }
  const manifest = JSON.parse(run('/usr/bin/unzip', ['-p', zip, 'manifest.json']));
  assert(files.includes(manifest.background.service_worker));
  assert(files.includes(manifest.side_panel.default_path));
  run(process.execPath, ['scripts/bundle-extension.mjs', '--development'], { TZ: 'Asia/Tokyo' });
  assert.equal(hash(), first, 'Archive differs after changing checkout permissions, timestamps or timezone');
});
