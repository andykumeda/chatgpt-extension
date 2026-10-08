import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { httpsURL, updateConfigurationReady, updateFeedForArchitecture, distribution, pkg, project, readJSON } from '../scripts/release-utils.mjs';
import path from 'node:path';

test('unpublished or invalid update configuration never enables updates', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  for (const value of [null, '', 'http://example.com/feed.xml', 'file:///tmp/feed.xml', 'https://user:password@example.com/feed.xml', 'https://example.com/feed.xml?token=private']) assert.equal(httpsURL(value), false);
  assert.equal(updateConfigurationReady({ updateFeedUrl: 'https://example.com/appcast-{arch}.xml', sparklePublicKey: key }), true);
  for (const invalid of [null, '', 'test', Buffer.alloc(31).toString('base64')]) assert.equal(updateConfigurationReady({ updateFeedUrl: 'https://example.com/appcast-{arch}.xml', sparklePublicKey: invalid }), false);
  assert.equal(updateConfigurationReady(distribution), false);
  assert.equal(updateConfigurationReady({ updateFeedUrl: 'https://example.com/appcast-arm64.xml', sparklePublicKey: key }), false);
  for (const arch of ['arm64', 'x64']) assert.equal(updateFeedForArchitecture({ updateFeedUrl: 'https://example.com/appcast-{arch}.xml' }, arch), `https://example.com/appcast-${arch}.xml`);
});

test('distribution versions, architectures and dependency pins agree', () => {
  const runtime = readJSON(path.join(project, 'distribution/node-runtime.json'));
  assert.deepEqual(Object.keys(runtime.checksums).sort(), ['arm64', 'x64']);
  for (const hash of Object.values(runtime.checksums)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(pkg.version, readJSON(path.join(project, 'extension/manifest.json')).version);
  const sparkle = readJSON(path.join(project, 'distribution/sparkle.json'));
  assert.match(sparkle.sha256, /^[a-f0-9]{64}$/);
  const pins = readJSON(path.join(project, 'macos/Package.resolved')).pins;
  assert.equal(pins.find(pin => pin.identity === 'sparkle').state.version, sparkle.version);
});

test('publishing and signing fail closed before any network or credential access', () => {
  const result = spawnSync(process.execPath, [path.join(project, 'scripts/publish-release.mjs')], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /explicit --approve-publication/);
  // A dirty-tree release cannot be mistaken for the development candidate's provenance.
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8' }).stdout;
  if (status.trim()) {
    const build = spawnSync(process.execPath, [path.join(project, 'scripts/build-macos.mjs')], { encoding: 'utf8' });
    assert.notEqual(build.status, 0); assert.match(build.stderr, /clean committed checkout/);
  }
  const workflow = fs.readFileSync(path.join(project, '.github/workflows/release.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /approve_publication/);
  assert.doesNotMatch(workflow, /DEVELOPER_ID_APPLICATION|NOTARYTOOL_PROFILE|SPARKLE_PRIVATE_KEY/);
});
