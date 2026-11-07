/**
 * 停止本地 dev 前后端：JCEF/Vite + Spring Boot（18421）。
 * Usage: node scripts/dev-stop.mjs
 *        npm run stop:dev   (from datawise-frontend)
 */
import {execSync} from 'node:child_process'
import {existsSync, readFileSync, rmSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {stopDesktopProcesses} from '../datawise-frontend/scripts/desktop/lib.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const frontendRoot = join(repoRoot, 'datawise-frontend')
const pidFile = join(frontendRoot, '.dev', 'backend.pid')

const ports = JSON.parse(
    readFileSync(join(frontendRoot, 'runtime-ports.json'), 'utf8'),
)

function log(tag, message) {
    console.log(`[${tag}] ${message}`)
}

function killTask(cmd) {
    try {
        execSync(cmd, {stdio: 'ignore', windowsHide: true})
    } catch {
        // already stopped
    }
}

function killPidTree(pid) {
    if (!pid || Number.isNaN(pid)) return
    if (process.platform === 'win32') {
        killTask(`taskkill /F /PID ${pid} /T`)
        return
    }
    try {
        process.kill(-pid, 'SIGTERM')
    } catch {
        try {
            process.kill(pid, 'SIGTERM')
        } catch {
            // ignore
        }
    }
}

function findListeningPids(port) {
    if (process.platform === 'win32') {
        try {
            const raw = execSync(`netstat -ano | findstr ":${port}"`, {
                encoding: 'utf8',
                windowsHide: true,
            })
            const pids = new Set()
            for (const line of raw.split(/\r?\n/)) {
                if (!/LISTENING/i.test(line)) continue
                const match = line.trim().match(/(\d+)\s*$/)
                if (match) pids.add(Number(match[1]))
            }
            return [...pids]
        } catch {
            return []
        }
    }

    try {
        const raw = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {encoding: 'utf8'})
        return raw
            .split(/\s+/)
            .map((value) => Number(value.trim()))
            .filter((pid) => Number.isFinite(pid) && pid > 0)
    } catch {
        return []
    }
}

function stopBackend() {
    if (existsSync(pidFile)) {
        const pid = Number(readFileSync(pidFile, 'utf8').trim())
        killPidTree(pid)
        rmSync(pidFile, {force: true})
        log('dev-stop', `stopped backend pid ${pid}`)
    }

    for (const pid of findListeningPids(ports.dev.backend)) {
        killPidTree(pid)
        log('dev-stop', `stopped listener on :${ports.dev.backend} (pid ${pid})`)
    }
}

function stopFrontendDevServer() {
    for (const pid of findListeningPids(ports.dev.frontend)) {
        killPidTree(pid)
        log('dev-stop', `stopped listener on :${ports.dev.frontend} (pid ${pid})`)
    }
}

function main() {
    stopDesktopProcesses()
    stopFrontendDevServer()
    stopBackend()
    log('dev-stop', 'dev frontend/backend stopped (if any were running)')
}

main()
