import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function check(root) {
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, item.name);
    if (item.isDirectory()) check(file);
    else if (/\.(mjs|js)$/.test(file)) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}
for (const root of ['bridge', 'extension', 'scripts', 'tests']) if (fs.existsSync(root)) check(root);
const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3 || manifest.host_permissions || manifest.externally_connectable || manifest.content_scripts) throw new Error('Unexpected broad manifest access.');
console.log('JavaScript syntax and narrow MV3 manifest checks passed.');
