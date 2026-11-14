/**
 * 本地开发：Vite + 同 JVM（Spring Boot + JetBrains JCEF）。
 * Usage: node scripts/dev-start.mjs
 *        node scripts/dev-start.mjs --dual     # 旧双进程：独立 backend + DatawiseDesktopApp
 *        node scripts/dev-start.mjs --compile  # 仅 --dual 时强制预编译 backend
 *        npm run dev   (仓库根目录)
 */
import {spawn, spawnSync} from 'node:child_process'
import {createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const backendRoot = join(repoRoot, 'datawise-backend')
const frontendRoot = join(repoRoot, 'datawise-frontend')
const configDir = join(repoRoot, 'config')
const devDir = join(frontendRoot, '.dev')
const pidFile = join(devDir, 'backend.pid')
const logFile = join(devDir, 'backend.log')

const ports = JSON.parse(
    readFileSync(join(frontendRoot, 'runtime-ports.json'), 'utf8'),
)

function log(tag, message) {
    console.log(`[${tag}] ${message}`)
}

/**
 * Each community plugin's package.mjs leaves a .dwp-staging tree behind; 13 of them had grown to
 * ~174 MB in the working copy. Prune anything older than a day so a dev machine never accumulates
 * them, without touching a staging dir another build is still using. Best effort: a failure here
 * must never block startup.
 */
function pruneStalePluginStaging() {
    try {
        const result = spawnSync(
            process.execPath,
            [join(repoRoot, 'scripts/clean-dwp-staging.mjs'), '--hours', '24'],
            {cwd: repoRoot, stdio: 'ignore'},
        )
        if (result.status === 0) {
            log('dev-start', 'pruned stale .dwp-staging directories')
        }
    } catch {
        // ignore — housekeeping only
    }
}

async function waitForUrl(url, timeoutMs = 120_000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        try {
            const res = await fetch(url, {signal: AbortSignal.timeout(2_000)})
            if (res.ok) return true
        } catch {
            // retry
        }
        await new Promise((r) => setTimeout(r, 400))
    }
    return false
}

async function isReady(url) {
    try {
        const res = await fetch(url, {signal: AbortSignal.timeout(1_500)})
        return res.ok
    } catch {
        return false
    }
}

function compileBackend() {
    return new Promise((resolve, reject) => {
        log('dev-start', 'compiling backend...')
        const child = spawn(
            'mvn',
            ['-pl', 'datawise-server', '-am', 'compile', '-DskipTests'],
            {
                cwd: backendRoot,
                stdio: 'inherit',
                shell: process.platform === 'win32',
                windowsHide: true,
            },
        )
        child.on('exit', (code) => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`backend compile failed (exit ${code ?? 'unknown'})`))
        })
    })
}

function startBackendDual() {
    mkdirSync(devDir, {recursive: true})
    const logStream = createWriteStream(logFile, {flags: 'a'})
    logStream.write(`\n--- backend dual-process start ${new Date().toISOString()} ---\n`)

    const jvmArgs = `-Ddatawise.config.dir=${configDir} -Ddatawise.logging.dir=${join(configDir, 'logs')}`
    const child = spawn(
        'mvn',
        ['-pl', 'datawise-server', '-am', 'spring-boot:run', `-Dspring-boot.run.jvmArguments=${jvmArgs}`],
        {
            cwd: backendRoot,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
            windowsHide: true,
        },
    )

    child.stdout?.pipe(logStream)
    child.stderr?.pipe(logStream)
    child.unref()

    writeFileSync(pidFile, String(child.pid), 'utf8')
    log('dev-start', `backend spawning (pid ${child.pid}, log: ${logFile})`)
    return child.pid
}

function startViteDevServer() {
    const edition = process.env.VITE_DATAWISE_EDITION === 'standard' ? 'standard' : 'full'
    const script = edition === 'standard' ? 'dev:standard' : 'dev'
    log('dev-start', `starting Vite (npm run ${script}, edition=${edition})…`)
    const child = spawn('npm', ['run', script], {
        cwd: frontendRoot,
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32',
        env: process.env,
    })
    child.unref()
    return child.pid
}

async function ensureVite() {
    const url = `http://127.0.0.1:${ports.dev.frontend}/`
    if (await isReady(url)) {
        log('dev-start', `Vite already listening on :${ports.dev.frontend}`)
        return
    }
    startViteDevServer()
    log('dev-start', `waiting for Vite on :${ports.dev.frontend}…`)
    if (!(await waitForUrl(url, 60_000))) {
        console.error(`[dev-start] Vite did not become ready within 60s`)
        process.exit(1)
    }
    log('dev-start', 'Vite ready')
}

function startDesktop(dual) {
    const args = dual ? ['run', 'dev:jcef:dual'] : ['run', 'dev:jcef']
    log('dev-start', dual
        ? 'starting dual-process desktop host…'
        : 'starting same-JVM desktop (Spring Boot + JCEF)…')
    const child = spawn('npm', args, {
        cwd: frontendRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: process.env,
    })
    child.on('exit', (code) => {
        process.exit(code ?? 0)
    })
}

async function main() {
    pruneStalePluginStaging()
    const dual = process.argv.includes('--dual')
    const forceCompile = process.argv.includes('--compile')
    const healthUrl = `http://127.0.0.1:${ports.dev.backend}/api/health`

    await ensureVite()

    if (!dual) {
        if (await isReady(healthUrl)) {
            log(
                'dev-start',
                `port :${ports.dev.backend} already in use — same-JVM needs it free. Run: npm run stop`,
            )
            process.exit(1)
        }
        startDesktop(false)
        return
    }

    // Legacy dual-process: separate spring-boot:run + DatawiseDesktopApp
    if (await isReady(healthUrl)) {
        log('dev-start', `backend already listening on :${ports.dev.backend}`)
        log('dev-start', 'after backend Java changes run: npm run stop && npm run dev -- --dual')
    } else {
        if (forceCompile) {
            await compileBackend()
        } else {
            log('dev-start', 'skip pre-compile — starting spring-boot:run directly')
        }
        startBackendDual()
        log('dev-start', `waiting for backend on :${ports.dev.backend}...`)
        if (!(await waitForUrl(healthUrl))) {
            console.error(`[dev-start] backend did not become ready within 120s. See ${logFile}`)
            process.exit(1)
        }
        log('dev-start', 'backend ready')
    }
    startDesktop(true)
}

main().catch((error) => {
    console.error('[dev-start]', error instanceof Error ? error.message : error)
    process.exit(1)
})
