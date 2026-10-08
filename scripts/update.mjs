import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertHostIdle, sourceInstallation } from './source-install.mjs';

export function updateSource(project) {
  const git = args => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
  if (git(['rev-parse', '--show-toplevel']) !== project) throw new Error('Update requires a Git clone of this repository. ZIP installations must download a new ZIP and rerun ./install.sh.');
  if (git(['status', '--porcelain'])) throw new Error('Local source changes exist. Update stopped without overwriting them. Commit or move your changes before updating.');
  if (git(['branch', '--show-current']) !== 'main') throw new Error('Automatic source updates require the main branch.');
  if (!['https://github.com/andykumeda/chatgpt-extension.git', 'git@github.com:andykumeda/chatgpt-extension.git'].includes(git(['remote', 'get-url', 'origin']))) throw new Error('Update requires the official repository as origin.');
  const info = sourceInstallation(project);
  assertHostIdle(info.previous.state || path.join(os.homedir(), '.codex/local-sidepanel'));
  git(['fetch', 'origin', 'main']);
  // Refuse local/divergent commits; never reset, discard, stash or force-pull.
  git(['merge', '--ff-only', 'FETCH_HEAD']);
  for (const script of ['test', 'check']) execFileSync('npm', ['run', script], { cwd: project, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(project, 'scripts/install-host.mjs')], { cwd: project, stdio: 'inherit' });
  console.log('Source updated and host registered. In chrome://extensions, click Reload for Local Codex, then reopen its toolbar action.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') throw new Error('Source installation supports macOS only.');
  if (process.argv.length !== 2) throw new Error('Usage: npm run update');
  updateSource(fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, ''));
}
