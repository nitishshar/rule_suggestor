/**
 * Launcher for Angular CLI that ensures 'rxjs' can be resolved.
 * Sets NODE_PATH so require('rxjs') from @angular-devkit/core finds rxjs
 * when it's only installed under node_modules/@angular-devkit/core/node_modules.
 * Run from project root: node scripts/ng-with-rxjs.js build
 */
const path = require('path');
const fs = require('fs');

const cwd = process.cwd();
const rootNodeModules = path.join(cwd, 'node_modules');
const coreNodeModules = path.join(rootNodeModules, '@angular-devkit', 'core', 'node_modules');

const existingPaths = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
const toAdd = [rootNodeModules];
if (fs.existsSync(coreNodeModules)) {
  toAdd.push(coreNodeModules);
}
const newPaths = [...toAdd, ...existingPaths];
process.env.NODE_PATH = newPaths.join(path.delimiter);

require(path.join(rootNodeModules, '@angular', 'cli', 'bin', 'ng'));
