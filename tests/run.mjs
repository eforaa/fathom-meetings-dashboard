// Runs every test file in this folder and sums up the result.
//   npm test
//
// Each file is its own process, so one blowing up cannot take the rest with
// it, and a file that forgets to call done() still counts by its exit code.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const files = readdirSync(here)
    .filter((name) => name.endsWith('.mjs'))
    //_check.mjs is the harness, run.mjs is this file
    .filter((name) => !name.startsWith('_') && name !== 'run.mjs')
    .sort();

let failed = 0;

for (const name of files) {
    console.log(`\n─── ${name} ${'─'.repeat(Math.max(0, 50 - name.length))}`);
    const result = spawnSync(process.execPath, [join(here, name)], { stdio: 'inherit' });
    if (result.status !== 0) failed += 1;
}

console.log(
    failed
        ? `\n${failed} of ${files.length} test files failed`
        : `\n${files.length} test files, all green`,
);
process.exit(failed ? 1 : 0);
