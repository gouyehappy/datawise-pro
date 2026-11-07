/**
 * Cross-platform headless-cli unit tests (no shell-glob dependency on Linux CI).
 */
import {spawnSync} from 'node:child_process'
import {readdirSync, statSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const testsRoot = join(root, 'src', '__tests__')

function collectTests(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        const st = statSync(full)
        if (st.isDirectory()) {
            collectTests(full, out)
        } else if (name.endsWith('.test.ts')) {
            out.push(full)
        }
    }
    return out
}

const files = collectTests(testsRoot).sort()
if (files.length === 0) {
    console.error('[test] no .test.ts files under src/__tests__')
    process.exit(1)
}

const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test', ...files],
    {cwd: root, stdio: 'inherit', env: process.env},
)
process.exit(result.status ?? 1)
