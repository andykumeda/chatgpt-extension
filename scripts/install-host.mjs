import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { installSource } from './source-install.mjs';
if (process.platform !== 'darwin') throw new Error('This installer currently supports macOS only.');
if (process.argv.slice(2).some(arg => arg !== '--testing')) throw new Error('Usage: npm run install-host [-- --testing]');
const result = installSource({ project: fileURLToPath(new URL('..', import.meta.url)), testing: process.argv.includes('--testing') });
console.log(`Installed native host: ${result.hostPath}\nExtension ID: ${result.extensionId}\nLoad unpacked: ${path.join(result.project, 'extension')}\nBridge state: ${result.state}\nWorkspace default: ${result.workspace}\nIf needed, run codex login, then connect in Chrome.\nUpdate this checkout with: npm run update`);
