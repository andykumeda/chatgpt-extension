import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, readJSON, run, sha256 } from './release-utils.mjs';
export async function fetchSparkle() {
  const config = readJSON(path.join(project, 'distribution/sparkle.json'));
  const vendor = path.join(project, '.runtime/vendor'); fs.mkdirSync(vendor, { recursive: true });
  const archive = path.join(vendor, `Sparkle-${config.version}.zip`);
  const legacyCache = path.join(project, `.runtime/Sparkle-${config.version}.zip`);
  if (!fs.existsSync(archive) && fs.existsSync(legacyCache) && sha256(legacyCache) === config.sha256) fs.copyFileSync(legacyCache, archive);
  if (!fs.existsSync(archive) || sha256(archive) !== config.sha256) {
    const temporary = `${archive}.download`;
    run('/usr/bin/curl', ['--fail', '--location', '--silent', '--show-error', '--connect-timeout', '15', '--max-time', '180', '--output', temporary, config.url]);
    if (sha256(temporary) !== config.sha256) { fs.unlinkSync(temporary); throw new Error('Pinned Sparkle artifact checksum mismatch.'); }
    fs.renameSync(temporary, archive);
  }
  const root = path.join(vendor, `sparkle-${config.version}`);
  fs.mkdirSync(root, { recursive: true });
  run('/usr/bin/ditto', ['-x', '-k', archive, root]);
  return { root, framework: path.join(root, 'Sparkle.xcframework/macos-arm64_x86_64/Sparkle.framework'), license: path.join(root, 'LICENSE') };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) console.log((await fetchSparkle()).root);
