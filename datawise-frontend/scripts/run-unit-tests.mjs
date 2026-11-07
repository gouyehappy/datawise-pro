/**
 * Cross-platform frontend unit tests (no shell-glob dependency on Linux CI).
 * Streams TAP output and prints a failed-id index at the end for easy log search.
 */
import {spawn} from 'node:child_process'
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

/** @param {string} chunk @param {{carry: string, failures: Array<{id: string, name: string}>}} state */
function consumeTapChunk(chunk, state) {
    state.carry += chunk
    const lines = state.carry.split(/\r?\n/)
    state.carry = lines.pop() ?? ''
    for (const line of lines) {
        const match = line.match(/^\s*not ok (\d+) - (.+)$/)
        if (!match) continue
        state.failures.push({id: match[1], name: match[2].trim()})
    }
}

function printFailureIndex(failures) {
    if (failures.length === 0) return
    // Dedupe exact id+name pairs (nested TAP can repeat in some Node versions)
    const seen = new Set()
    const unique = []
    for (const item of failures) {
        const key = `${item.id}\0${item.name}`
        if (seen.has(key)) continue
        seen.add(key)
        unique.push(item)
    }
    console.log('')
    console.log('# ===== Failed tests (Ctrl+F: not ok <id>) =====')
    for (const item of unique) {
        console.log(`# not ok ${item.id} - ${item.name}`)
    }
    console.log(`# failed_entries ${unique.length}`)
    console.log('# ==============================================')
}

const files = collectTests(testsRoot).sort()
if (files.length === 0) {
    console.error('[test] no .test.ts files under src/__tests__')
    process.exit(1)
}

const tapState = {carry: '', failures: []}

/** Windows argv limit (~8191); batch long path lists (305+ test files). */
const BATCH_SIZE = 25

function runTestBatch(batch) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [
                '--import',
                'tsx',
                '--import',
                './scripts/test-setup.mjs',
                '--test',
                '--test-reporter=tap',
                ...batch,
            ],
            {
                cwd: root,
                env: process.env,
                stdio: ['inherit', 'pipe', 'pipe'],
            },
        )

        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (chunk) => {
            process.stdout.write(chunk)
            consumeTapChunk(chunk, tapState)
        })
        child.stderr.on('data', (chunk) => {
            process.stderr.write(chunk)
        })

        child.on('error', reject)
        child.on('close', (code, signal) => {
            if (signal) {
                reject(Object.assign(new Error(`test runner killed: ${signal}`), {signal}))
                return
            }
            resolve(code ?? 1)
        })
    })
}

async function main() {
    let exitCode = 0
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE)
        const code = await runTestBatch(batch)
        if (code !== 0) exitCode = code
    }
    if (tapState.carry) consumeTapChunk('\n', tapState)
    printFailureIndex(tapState.failures)
    process.exit(exitCode)
}

main().catch((error) => {
    console.error('[test] failed to start node test runner:', error)
    process.exit(1)
})
