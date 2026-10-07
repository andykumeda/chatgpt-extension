import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const inside = (child, parent) => {
  const relative = path.relative(parent.toLowerCase(), child.toLowerCase());
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

export class PathPolicy {
  constructor(home = os.homedir()) {
    this.home = fs.realpathSync(home);
    this.blocked = [path.join(this.home, 'Documents'),
      path.join(this.home, 'Library/Mobile Documents'),
      path.join(this.home, 'Library/CloudStorage')];
    for (const root of [...this.blocked]) {
      try { this.blocked.push(fs.realpathSync(root)); } catch {}
    }
  }

  expand(value) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
      throw new Error('Choose an existing absolute local workspace path.');
    }
    const expanded = value === '~' ? this.home : value.startsWith('~/') ? path.join(this.home, value.slice(2)) : value;
    if (!path.isAbsolute(expanded)) throw new Error('Workspace must be an absolute path or start with ~/.');
    return path.resolve(expanded);
  }

  assertSafe(value) {
    const absolute = this.expand(value);
    if (this.blocked.some(root => inside(absolute, root) || inside(root, absolute))) {
      throw new Error('Documents, iCloud/CloudStorage, and their ancestor directories are forbidden. Choose a local folder such as ~/.codex/Codex.');
    }
    return absolute;
  }

  // Resolve the nearest existing parent before creating any managed directory.
  safeFuture(value) {
    const absolute = this.assertSafe(value);
    let parent = absolute;
    const tail = [];
    while (!fs.existsSync(parent)) {
      // A dangling symlink must fail instead of being treated as a missing folder.
      try { fs.lstatSync(parent); throw new Error('Managed path contains a dangling symlink.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      tail.unshift(path.basename(parent));
      const next = path.dirname(parent);
      if (next === parent) throw new Error('Cannot resolve managed path.');
      parent = next;
    }
    return this.assertSafe(path.join(fs.realpathSync(parent), ...tail));
  }

  directory(value) {
    const absolute = this.assertSafe(value);
    let real;
    try { real = fs.realpathSync(absolute); }
    catch { throw new Error(`Workspace unavailable: ${absolute}. Create the folder locally or choose another existing folder; no fallback was used.`); }
    this.assertSafe(real);
    if (!fs.statSync(real).isDirectory()) throw new Error(`Workspace is not a directory: ${absolute}`);
    try { fs.accessSync(real, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK); }
    catch { throw new Error(`Workspace is not readable and writable: ${absolute}. Fix its permissions or choose another folder.`); }
    return real;
  }

  create(value) {
    const safe = this.safeFuture(value);
    fs.mkdirSync(safe, { recursive: true, mode: 0o700 });
    return this.directory(safe);
  }
}

export const sandboxPolicy = workspace => ({
  type: 'workspaceWrite', writableRoots: [workspace], networkAccess: false,
  excludeSlashTmp: true, excludeTmpdirEnvVar: true,
});
