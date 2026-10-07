import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PathPolicy } from '../bridge/paths.mjs';

const policy = new PathPolicy();
const project = policy.directory(fileURLToPath(new URL('..', import.meta.url)));
const git = args => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
if (git(['status', '--porcelain'])) throw new Error('Commit source changes before bundling; only clean committed source is packaged.');
const { version } = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a numeric package version.');
const name = `local-codex-sidepanel-${version}-macos`;
const output = policy.create(path.join(project, 'output/releases'));
const zip = policy.safeFuture(path.join(output, `${name}.zip`));
const checksum = policy.safeFuture(`${zip}.sha256`);
const files = ['.gitignore', 'package.json', 'README.md', 'INSTALL.md', 'PLAN.md', 'TASKS.md', 'VERIFICATION.md', 'bridge', 'extension', 'scripts', 'tests'];
// Git archive cannot include ignored runtime state, credentials, or local chat history.
execFileSync('git', ['archive', '--format=zip', `--prefix=${name}/`, `--output=${zip}`, 'HEAD', '--', ...files], { cwd: project, stdio: 'inherit' });
const hash = createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(checksum, `${hash}  ${path.basename(zip)}\n`);
console.log(`Source: ${git(['rev-parse', 'HEAD'])}\nBundle: ${zip}\nChecksum: ${checksum}\nSHA-256: ${hash}`);
