import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPublicKey, verify } from 'node:crypto';
import { project, pkg, distribution, run, releaseGuard, readJSON, checksum, sha256, updateConfigurationReady } from './release-utils.mjs';
import { fetchSparkle } from './fetch-sparkle.mjs';
const development = process.argv.includes('--development');
const arch = process.argv.find(arg => arg.startsWith('--arch='))?.split('=')[1] || process.arch;
if (process.argv.slice(2).some(arg => arg !== '--development' && !/^--arch=(arm64|x64)$/.test(arg))) throw new Error('Usage: prepare-release.mjs [--development] [--arch=arm64|x64]');
const source = releaseGuard(development);
const app = path.join(project, 'output/macos', arch, 'Local Codex.app');
const build = readJSON(path.join(app, 'Contents/Resources/build.json'));
if (build.version !== pkg.version || build.source !== source || build.development !== development || build.architecture !== arch) throw new Error('Rebuild the matching app before preparing this release.');
if (!development && (!process.env.NOTARYTOOL_PROFILE || !process.env.SPARKLE_PRIVATE_KEY_FILE || !updateConfigurationReady())) throw new Error('Signed releases require an approved notary profile and dedicated Sparkle private key file.');
run(process.execPath, [path.join(project, 'scripts/verify-macos.mjs'), `--arch=${arch}`], { stdio: 'inherit' });
run(process.execPath, [path.join(project, 'scripts/bundle-extension.mjs'), ...(development ? ['--development'] : [])], { stdio: 'inherit' });
const output = path.join(project, 'output/releases'); fs.mkdirSync(output, { recursive: true });
const suffix = development ? '-development' : '';
const name = `local-codex-${pkg.version}-macos-${arch}${suffix}`;
const zip = path.join(output, `${name}.zip`);
const dmg = path.join(output, `${name}.dmg`);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'local-codex-dmg-'));
function archive() {
  fs.rmSync(zip, { force: true });
  run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
}
function notarize(file) {
  const result = JSON.parse(run('/usr/bin/xcrun', ['notarytool', 'submit', file, '--keychain-profile', process.env.NOTARYTOOL_PROFILE, ...(process.env.NOTARYTOOL_KEYCHAIN ? ['--keychain', process.env.NOTARYTOOL_KEYCHAIN] : []), '--wait', '--output-format', 'json']));
  if (result.status !== 'Accepted') throw new Error(`Apple notarization was not accepted. Submission ID: ${result.id || 'unavailable'}`);
}
let feed;
try {
  if (!development) {
    archive(); notarize(zip);
    run('/usr/bin/xcrun', ['stapler', 'staple', app]);
    run('/usr/bin/xcrun', ['stapler', 'validate', app]);
    run('/usr/sbin/spctl', ['--assess', '--type', 'execute', app]);
  }
  archive();
  run('/usr/bin/ditto', [app, path.join(stage, 'Local Codex.app')]);
  fs.writeFileSync(path.join(stage, 'Read me.txt'), `Local Codex ${pkg.version}\n\nOpen Local Codex.app and click Install and connect Chrome.\nIt installs in ~/Applications and preserves existing chats.\nClose the Chrome side panel before installing/updating.\n\n${development ? 'LOCAL DEVELOPMENT CANDIDATE: not notarized, not a public release.\n' : ''}Codex CLI and your own sign-in are required; Node is included.\n`);
  fs.rmSync(dmg, { force: true });
  run('/usr/bin/hdiutil', ['create', '-quiet', '-volname', 'Local Codex', '-srcfolder', stage, '-format', 'UDZO', '-ov', dmg]);
  run('/usr/bin/hdiutil', ['verify', dmg]);
  if (!development) {
    run('/usr/bin/codesign', ['--force', '--sign', process.env.DEVELOPER_ID_APPLICATION, '--timestamp', dmg]);
    notarize(dmg); run('/usr/bin/xcrun', ['stapler', 'staple', dmg]); run('/usr/bin/xcrun', ['stapler', 'validate', dmg]);
    const sparkle = await fetchSparkle();
    const feedStage = path.join(project, '.runtime/release-feeds', arch); fs.mkdirSync(feedStage, { recursive: true });
    // Keep each architecture's appcast distinct; never let an ARM-only Node runtime update Intel Macs.
    for (const entry of fs.readdirSync(feedStage)) if (/\.(zip|xml)$/.test(entry)) fs.rmSync(path.join(feedStage, entry));
    fs.copyFileSync(zip, path.join(feedStage, path.basename(zip)));
    feed = path.join(output, `appcast-${arch}.xml`);
    run(path.join(sparkle.root, 'bin/generate_appcast'), ['--ed-key-file', process.env.SPARKLE_PRIVATE_KEY_FILE, '--download-url-prefix', `https://github.com/andykumeda/chatgpt-extension/releases/download/v${pkg.version}/`, '--maximum-deltas', '0', '-o', feed, feedStage]);
    const xml = fs.readFileSync(feed, 'utf8');
    const signature = xml.match(/sparkle:edSignature="([A-Za-z0-9+/=]+)"/)?.[1];
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(distribution.sparklePublicKey, 'base64')]), type: 'spki', format: 'der' });
    if (!signature || !verify(null, fs.readFileSync(zip), key, Buffer.from(signature, 'base64'))) throw new Error('Sparkle archive signature does not match the configured public key.');
    run(path.join(sparkle.root, 'bin/sign_update'), ['--verify', '--ed-key-file', process.env.SPARKLE_PRIVATE_KEY_FILE, feed]);
  }
  const extension = path.join(output, `local-codex-extension-${pkg.version}${suffix}.zip`);
  const files = [zip, dmg, extension, ...(feed ? [feed] : [])];
  for (const file of files) checksum(file);
  const manifest = { version: pkg.version, buildNumber: pkg.buildNumber, source, architecture: arch, development, notarized: !development, protocolVersion: distribution.protocolVersion, artifacts: files.flatMap(file => [file, `${file}.sha256`]).map(file => ({ name: path.basename(file), sha256: sha256(file), bytes: fs.statSync(file).size })) };
  fs.writeFileSync(path.join(output, `release-${arch}${suffix}.json`), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${development ? 'Local development archives prepared; NOT publishable' : 'Signed, notarized archives and signed architecture-specific appcast prepared'}: ${output}`);
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
