import fs from 'node:fs';
import path from 'node:path';
import { project, pkg, distribution, run, releaseGuard, updateConfigurationReady, updateFeedForArchitecture, walk, xml } from './release-utils.mjs';
import { fetchRuntime } from './fetch-runtime.mjs';
import { fetchSparkle } from './fetch-sparkle.mjs';

const args = process.argv.slice(2);
const development = args.includes('--development');
const arch = args.find(arg => arg.startsWith('--arch='))?.split('=')[1] || process.arch;
if (args.some(arg => arg !== '--development' && !/^--arch=(arm64|x64)$/.test(arg))) throw new Error('Usage: build-macos.mjs [--development] [--arch=arm64|x64]');
if (process.platform !== 'darwin') throw new Error('Mac app packaging requires macOS/Xcode.');
const source = releaseGuard(development);
if (!['arm64', 'x64'].includes(arch)) throw new Error('Unsupported Mac architecture.');
const identity = development ? '-' : process.env.DEVELOPER_ID_APPLICATION;
if (!development && !identity?.startsWith('Developer ID Application:')) throw new Error('Set DEVELOPER_ID_APPLICATION to an approved Developer ID Application identity.');
if (!development && !updateConfigurationReady()) throw new Error('Configure the approved HTTPS update feed and dedicated Sparkle public verification key before a release build.');
const runtime = await fetchRuntime(arch);
const sparkle = await fetchSparkle();
const framework = sparkle.framework;
const bin = path.join(project, '.runtime/companion-bin', arch);
fs.mkdirSync(bin, { recursive: true });
const env = { ...process.env, MACOSX_DEPLOYMENT_TARGET: distribution.minimumMacOSVersion, CLANG_MODULE_CACHE_PATH: path.join(project, '.runtime/clang-cache'), SWIFTPM_MODULECACHE_OVERRIDE: path.join(project, '.runtime/swift-module-cache') };
console.log(`Building Local Codex ${pkg.version} (${arch}); ${development ? 'local development candidate' : 'signed release'}…`);
const sources = walk(path.join(project, 'macos/Sources/LocalCodex')).filter(file => file.endsWith('.swift'));
// Compile against the exact upstream binary artifact; avoids SwiftPM's stalled binary downloader.
run('/usr/bin/swiftc', ['-O', '-parse-as-library', '-swift-version', '5', '-target', `${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx${distribution.minimumMacOSVersion}`, '-sdk', run('/usr/bin/xcrun', ['--show-sdk-path']).trim(), '-F', path.dirname(framework), '-framework', 'Sparkle', '-Xlinker', '-rpath', '-Xlinker', '@executable_path/../Frameworks', ...sources, '-o', path.join(bin, 'LocalCodex')], { env, stdio: 'inherit' });
const output = path.join(project, 'output/macos', arch);
fs.mkdirSync(output, { recursive: true });
const app = path.join(output, 'Local Codex.app');
// Replace only this script's deterministic build output, never an installed app.
fs.rmSync(app, { recursive: true, force: true });
const contents = path.join(app, 'Contents');
const resources = path.join(contents, 'Resources');
fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
fs.mkdirSync(resources, { recursive: true });
fs.mkdirSync(path.join(contents, 'Frameworks'), { recursive: true });
fs.copyFileSync(path.join(bin, 'LocalCodex'), path.join(contents, 'MacOS/LocalCodex'));
for (const folder of ['bridge', 'companion', 'extension', 'distribution']) {
  fs.cpSync(path.join(project, folder), path.join(resources, folder), { recursive: true, filter: (file) => {
    const relative = path.relative(path.join(project, folder), file);
    if (!relative) return true;
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Unexpected source symlink in ${folder}.`);
    return !relative.split(path.sep).some(part => part.startsWith('.') || ['node_modules', 'store'].includes(part));
  } });
}
fs.copyFileSync(path.join(project, 'package.json'), path.join(resources, 'package.json'));
fs.mkdirSync(path.join(resources, 'runtime'));
fs.copyFileSync(runtime.binary, path.join(resources, 'runtime/node')); fs.chmodSync(path.join(resources, 'runtime/node'), 0o755);
fs.copyFileSync(runtime.license, path.join(resources, 'runtime/LICENSE-Node.txt'));
fs.copyFileSync(sparkle.license, path.join(resources, 'LICENSE-Sparkle.txt'));
run('/usr/bin/ditto', [framework, path.join(contents, 'Frameworks/Sparkle.framework')]);
run('/usr/bin/clang', ['-O2', '-Wall', '-Werror', '-target', `${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx${distribution.minimumMacOSVersion}`, path.join(project, 'distribution/native-host.c'), '-o', path.join(contents, 'MacOS/native-host')]);
const info = {
  CFBundleIdentifier: distribution.bundleIdentifier, CFBundleName: distribution.appName,
  CFBundleDisplayName: distribution.appName, CFBundleExecutable: 'LocalCodex', CFBundlePackageType: 'APPL',
  CFBundleShortVersionString: pkg.version, CFBundleVersion: String(pkg.buildNumber),
  LSMinimumSystemVersion: distribution.minimumMacOSVersion, NSHighResolutionCapable: true,
  LSUIElement: true,
  LocalCodexDevelopmentBuild: development,
  SUEnableAutomaticChecks: updateConfigurationReady() && !development,
  SUAutomaticallyUpdate: false, SUEnableSystemProfiling: false,
  ...(updateConfigurationReady() && !development ? { SUFeedURL: updateFeedForArchitecture(distribution, arch), SUPublicEDKey: distribution.sparklePublicKey, SUVerifyUpdateBeforeExtraction: true, SURequireSignedFeed: true } : {}),
};
const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${Object.entries(info).map(([key, value]) => `<key>${xml(key)}</key>${typeof value === 'boolean' ? value ? '<true/>' : '<false/>' : `<string>${xml(value)}</string>`}`).join('')}</dict></plist>\n`;
fs.writeFileSync(path.join(contents, 'Info.plist'), plist);
fs.writeFileSync(path.join(resources, 'build.json'), JSON.stringify({ version: pkg.version, buildNumber: pkg.buildNumber, architecture: arch, source, development, nodeVersion: runtime.version, protocolVersion: distribution.protocolVersion }, null, 2) + '\n');
// Sign nested Mach-O code individually, then bundles, then the outer app. Never sign --deep.
const signArgs = development ? ['--force', '--sign', '-'] : ['--force', '--sign', identity, '--options', 'runtime', '--timestamp'];
const frameworkRoot = path.join(contents, 'Frameworks/Sparkle.framework');
const binaries = walk(frameworkRoot).filter(file => fs.lstatSync(file).isFile() && /Mach-O/.test(run('/usr/bin/file', ['-b', file])));
for (const binary of binaries) run('/usr/bin/codesign', [...signArgs, binary]);
const nested = ['Versions/B/XPCServices/Installer.xpc', 'Versions/B/XPCServices/Downloader.xpc', 'Versions/B/Updater.app'];
for (const relative of nested) {
  const bundle = path.join(frameworkRoot, relative);
  if (fs.existsSync(bundle)) run('/usr/bin/codesign', [...signArgs, bundle]);
}
run('/usr/bin/codesign', [...signArgs, frameworkRoot]);
run('/usr/bin/codesign', [...signArgs, '--entitlements', path.join(project, 'distribution/node.entitlements.plist'), path.join(resources, 'runtime/node')]);
run('/usr/bin/codesign', [...signArgs, path.join(contents, 'MacOS/native-host')]);
run('/usr/bin/codesign', [...signArgs, app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
run(path.join(resources, 'runtime/node'), ['--version']);
console.log(`App built and signature structure verified: ${app}`);
