/** Loads the repo-root .env into process.env (KEY=value lines; never overrides a variable already set). */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadRootEnv(files = [resolve(import.meta.dirname, '../../.env')]) {
  for (const file of files) {
    try {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m || line.trim().startsWith('#')) continue;
        const v = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
      }
    } catch {
      /* no file */
    }
  }
}
