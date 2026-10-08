import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, readJSON, run, sha256 } from './release-utils.mjs';
export async function fetchRuntime(arch = process.arch) {
  if (!['arm64', 'x64'].includes(arch)) throw new Error('Supported Mac architectures: arm64, x64.');
  const config = readJSON(path.join(project, 'distribution/node-runtime.json'));
  const name = `node-v${config.version}-darwin-${arch}`;
  const vendor = path.join(project, '.runtime/vendor'); fs.mkdirSync(vendor, { recursive: true });
  const archive = path.join(vendor, `${name}.tar.gz`);
  if (!fs.existsSync(archive) || sha256(archive) !== config.checksums[arch]) {
    const response = await fetch(`${config.source}${name}.tar.gz`);
    if (!response.ok) throw new Error(`Official Node download failed (${response.status}).`);
    const data = Buffer.from(await response.arrayBuffer());
    const temporary = `${archive}.download`; fs.writeFileSync(temporary, data);
    if (sha256(temporary) !== config.checksums[arch]) { fs.unlinkSync(temporary); throw new Error('Official Node archive checksum mismatch.'); }
    fs.renameSync(temporary, archive);
  }
  // Always extract from the verified archive, so an altered cached executable is never shipped.
  run('/usr/bin/tar', ['-xzf', archive, '-C', vendor, `${name}/bin/node`, `${name}/LICENSE`]);
  return { binary: path.join(vendor, name, 'bin/node'), license: path.join(vendor, name, 'LICENSE'), version: config.version };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arch = process.argv.find(arg => arg.startsWith('--arch='))?.split('=')[1] || process.arch;
  const result = await fetchRuntime(arch); console.log(`Verified Node ${result.version} (${arch}): ${result.binary}`);
}
