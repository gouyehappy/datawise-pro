/**
 * Ensure ../sql-editor has installable deps for vue-tsc / Vite
 * (peers + @vue/tsconfig). Skips lifecycle scripts (no Puppeteer download).
 *
 * Idempotent: no-op when @vue/tsconfig is already present.
 * Prefers pnpm when sql-editor/pnpm-lock.yaml exists (npm ci alone misses it).
 */
import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sqlEditorRoot = join(frontendRoot, '..', 'sql-editor')
const marker = join(sqlEditorRoot, 'node_modules', '@vue', 'tsconfig', 'package.json')
const markerDom = join(sqlEditorRoot, 'node_modules', '@vue', 'tsconfig', 'tsconfig.dom.json')

if (existsSync(marker) && existsSync(markerDom)) {
    console.log('[ensure:sql-editor] deps already present')
    process.exit(0)
}

const usePnpm = existsSync(join(sqlEditorRoot, 'pnpm-lock.yaml'))
const cmd = usePnpm ? 'pnpm' : 'npm'
const args = usePnpm
    ? ['install', '--ignore-scripts', '--frozen-lockfile']
    : ['ci', '--ignore-scripts']

console.log(`[ensure:sql-editor] ${cmd} ${args.join(' ')}…`)
const result = spawnSync(cmd, args, {
    cwd: sqlEditorRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
})
if ((result.status ?? 1) !== 0 && usePnpm) {
    // Frozen lockfile can fail on a half-wiped node_modules; retry without freeze.
    console.log('[ensure:sql-editor] retry: pnpm install --ignore-scripts…')
    const retry = spawnSync('pnpm', ['install', '--ignore-scripts'], {
        cwd: sqlEditorRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    })
    process.exit(retry.status ?? 1)
}
process.exit(result.status ?? 1)
