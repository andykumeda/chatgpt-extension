// Explicit release-only publisher for GitHub Actions. Never run for development artifacts.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { project, pkg, run, readJSON, sha256 } from './release-utils.mjs';
const args = process.argv.slice(2);
if (!args.includes('--approve-publication')) throw new Error('Publication requires explicit --approve-publication after release approval.');
if (!process.env.GITHUB_TOKEN) throw new Error('A scoped GitHub release token is required.');
const directory = path.resolve(args.find(arg => arg.startsWith('--directory='))?.slice('--directory='.length) || path.join(project, 'output/releases'));
const tag = `v${pkg.version}`;
const source = run('git', ['rev-parse', 'HEAD']).trim();
const manifests = ['arm64', 'x64'].map(arch => readJSON(path.join(directory, `release-${arch}.json`)));
const artifacts = new Map();
for (const manifest of manifests) {
  if (manifest.development !== false || manifest.notarized !== true || manifest.version !== pkg.version || manifest.source !== source) throw new Error('Only matching, signed, notarized ARM and Intel release artifacts may be published.');
  for (const artifact of manifest.artifacts) {
    if (path.basename(artifact.name) !== artifact.name || /development/.test(artifact.name)) throw new Error('Invalid release artifact name.');
    const file = path.join(directory, artifact.name);
    if (sha256(file) !== artifact.sha256 || fs.statSync(file).size !== artifact.bytes) throw new Error('Release artifact checksum/size mismatch.');
    if (artifacts.has(artifact.name) && artifacts.get(artifact.name).sha256 !== artifact.sha256) throw new Error('Architectures contain conflicting shared artifacts.');
    artifacts.set(artifact.name, artifact);
  }
}
for (const arch of ['arm64', 'x64']) if (!artifacts.has(`appcast-${arch}.xml`)) throw new Error('Both signed update feeds must be available before publication.');
const apiRoot = 'https://api.github.com/repos/andykumeda/chatgpt-extension';
const headers = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`GitHub release request failed (${response.status}). Check the draft release before retrying.`);
  return response.json();
}
// Existing tags must identify exactly the source used for both signed artifacts.
const tagResponse = await fetch(`${apiRoot}/git/ref/tags/${tag}`, { headers });
if (tagResponse.ok) {
  let object = (await tagResponse.json()).object;
  for (let depth = 0; object.type === 'tag' && depth < 8; depth++) object = (await request(`${apiRoot}/git/tags/${object.sha}`)).object;
  if (object.type !== 'commit' || object.sha !== source) throw new Error('Existing release tag does not match the verified source commit.');
} else if (tagResponse.status !== 404) throw new Error(`Cannot verify release tag (${tagResponse.status}).`);
let release;
const existing = await fetch(`${apiRoot}/releases/tags/${tag}`, { headers });
if (existing.ok) release = await existing.json();
else if (existing.status === 404) release = await request(`${apiRoot}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, target_commitish: source, name: `Local Codex ${pkg.version}`, draft: true, prerelease: false, body: 'Mac companion with bundled Node, guided Chrome setup, automatic page context, model selection, and version compatibility checks. Requires macOS 13.5+, Chrome, Codex CLI and your own Codex account. Install the matching ARM or Intel DMG; the Chrome Web Store listing is tracked separately.' }) });
else throw new Error(`Cannot inspect existing release (${existing.status}).`);
if (!release.draft) throw new Error('This release is already public. Its artifacts were not changed.');
for (const artifact of artifacts.values()) {
  const asset = release.assets.find(asset => asset.name === artifact.name);
  if (asset) {
    if (asset.digest !== `sha256:${artifact.sha256}`) throw new Error('Existing draft asset differs or lacks a verified digest; inspect it before retrying.');
    continue;
  }
  const uploaded = await request(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(artifact.name)}`, { method: 'POST', headers: { 'Content-Type': artifact.name.endsWith('.xml') ? 'application/xml' : 'application/octet-stream' }, body: fs.readFileSync(path.join(directory, artifact.name)) });
  if (uploaded.digest !== `sha256:${artifact.sha256}`) throw new Error('GitHub asset digest did not verify. Draft remains unpublished.');
}
const verifiedDraft = await request(`${apiRoot}/releases/${release.id}`);
for (const artifact of artifacts.values()) if (!verifiedDraft.assets.some(asset => asset.name === artifact.name && asset.digest === `sha256:${artifact.sha256}`)) throw new Error('Draft asset verification failed.');
// Publish only after every download and both signed feeds are uploaded and hash verified.
release = await request(`${apiRoot}/releases/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, make_latest: 'true' }) });
const publicRelease = await fetch(`${apiRoot}/releases/tags/${tag}`);
if (!publicRelease.ok || (await publicRelease.json()).draft) throw new Error('Publication outcome is uncertain. Inspect GitHub before retrying.');
for (const arch of ['arm64', 'x64']) {
  const response = await fetch(`https://github.com/andykumeda/chatgpt-extension/releases/latest/download/appcast-${arch}.xml`);
  if (!response.ok || createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex') !== artifacts.get(`appcast-${arch}.xml`).sha256) throw new Error('Release published, but the public update feed did not verify. Inspect before advertising updates.');
}
console.log(`Published and verified: ${release.html_url}`);
