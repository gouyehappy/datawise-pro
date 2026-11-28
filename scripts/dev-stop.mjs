/**
 * 停止本地 dev 前后端：JCEF/Vite + Spring Boot（及残留的 dw/npm 树）。
 * Usage: node scripts/dev-stop.mjs
 *        npm run stop          (仓库根目录)
 *        npm run stop:dev      (from datawise-frontend)
 */
import {execSync, spawnSync} from 'node:child_process'
import {existsSync, readFileSync, rmSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {stopDesktopProcesses} from '../datawise-frontend/scripts/desktop/lib.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const frontendRoot = join(repoRoot, 'datawise-frontend')
const pidFile = join(frontendRoot, '.dev', 'backend.pid')
const isWin = process.platform === 'win32'

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
    if (isWin) {
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
    if (isWin) {
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

/**
 * Vite / dw / npm run dev 常以 detached 启动，Ctrl+C 杀不到父窗口。
 * 按命令行再扫一遍本仓库相关 node/java。
 */
function stopRepoDevProcesses() {
    const markers = [
        'scripts\\dw.mjs',
        'scripts/dw.mjs',
        'scripts\\dev-start.mjs',
        'scripts/dev-start.mjs',
        'scripts\\dev-stop.mjs',
        'datawise-frontend\\node_modules\\vite',
        'datawise-frontend/node_modules/vite',
        'datawise-desktop\\scripts\\ensure-and-run',
        'datawise-desktop/scripts/ensure-and-run',
        'npm run dev:all',
        'npm-cli.js" run dev:all',
        'npm-cli.js run dev:all',
        'npm run dev:jcef',
        'npm-cli.js" run dev:jcef',
        'npm-cli.js run dev:jcef',
        'npm run dev:standard',
        'DatawiseDesktopApp',
        'DatawiseBackendApplication',
        'jbr_jcef',
        'datawise-server',
    ]

    if (isWin) {
        const rootAlt = repoRoot.replace(/\\/g, '/')
        const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$markers = @(${markers.map((m) => `'${m.replace(/'/g, "''")}'`).join(',')})
$rootA = '${repoRoot.replace(/'/g, "''")}'
$rootB = '${rootAlt.replace(/'/g, "''")}'
$self = ${process.pid}
Get-CimInstance Win32_Process | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return }
  if ($_.ProcessId -eq $self) { return }
  if ($cmd -match 'dev-stop\\.mjs') { return }
  $inRepo = ($cmd -like ('*' + $rootA + '*')) -or ($cmd -like ('*' + $rootB + '*'))
  $hit = $false
  foreach ($m in $markers) { if ($cmd -like ('*' + $m + '*')) { $hit = $true; break } }
  if (-not $hit) { return }
  # 全局名（npm script）也要求命令行里能看到本仓库路径，避免误杀别的项目
  if (-not $inRepo -and ($cmd -notmatch 'jbr_jcef|DatawiseDesktopApp|DatawiseBackendApplication|datawise-server')) { return }
  Write-Host ('  - kill PID ' + $_.ProcessId)
  try { taskkill /F /PID $_.ProcessId /T 2>$null | Out-Null } catch {}
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
`
        const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
            encoding: 'utf8',
            windowsHide: true,
        })
        const out = (r.stdout || '').trim()
        if (out) console.log(out)
        return
    }

    // POSIX: pkill by pattern (best effort)
    for (const pat of [
        'dw\\.mjs',
        'dev-start\\.mjs',
        'vite.*datawise-frontend',
        'ensure-and-run\\.mjs',
        'DatawiseDesktopApp',
        'DatawiseBackendApplication',
    ]) {
        try {
            execSync(`pkill -f "${pat}"`, {stdio: 'ignore'})
        } catch {
            // none
        }
    }
}

function portsStillBusy() {
    const busy = []
    for (const [name, port] of [
        ['backend', ports.dev.backend],
        ['frontend', ports.dev.frontend],
    ]) {
        const pids = findListeningPids(port)
        if (pids.length) busy.push(`${name}:${port}→${pids.join(',')}`)
    }
    return busy
}

function main() {
    log('dev-stop', 'stopping local DataWise dev…')
    // 1) 桌面/安装包残留
    try {
        stopDesktopProcesses()
    } catch (e) {
        log('dev-stop', `desktop cleanup warn: ${e instanceof Error ? e.message : e}`)
    }
    // 2) 端口监听者（Vite / Spring）
    stopFrontendDevServer()
    stopBackend()
    // 3) detached 残留的 node/java 树
    stopRepoDevProcesses()
    // 4) 再清一次端口（防竞态）
    stopFrontendDevServer()
    stopBackend()

    const busy = portsStillBusy()
    if (busy.length) {
        log('dev-stop', `still busy: ${busy.join(' ; ')} — retrying kill`)
        for (const item of busy) {
            const port = Number(item.split(':')[1]?.split('→')[0])
            for (const pid of findListeningPids(port)) killPidTree(pid)
        }
    }
    const left = portsStillBusy()
    if (left.length) {
        log('dev-stop', `FAILED to free: ${left.join(' ; ')}`)
        process.exitCode = 1
        return
    }
    log('dev-stop', `ok — ports :${ports.dev.backend} / :${ports.dev.frontend} free`)
}

main()
