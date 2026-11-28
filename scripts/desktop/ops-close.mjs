#!/usr/bin/env node
/**
 * Stop DataWise Ops (web server on port + leftover ops node processes).
 *   npm run ops:close
 *   ops-close.bat
 * Also imported by ship-release-menu on Quit (Q) so exiting the menu cleans up.
 */
import {spawnSync} from 'node:child_process'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PORT = Number(process.env.OPS_WEB_PORT || 3927)
const isWin = process.platform === 'win32'

function killPort(port, {quiet = false} = {}) {
    if (!isWin) {
        const r = spawnSync('sh', ['-c', `lsof -ti tcp:${port} | xargs -r kill -9`], {
            encoding: 'utf8',
        })
        return r.status === 0
    }
    const net = spawnSync('netstat', ['-ano'], {encoding: 'utf8', windowsHide: true})
    const text = net.stdout || ''
    const pids = new Set()
    for (const line of text.split(/\r?\n/)) {
        if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid)
    }
    for (const pid of pids) {
        if (!quiet) console.log(`  - kill PID ${pid} (port ${port})`)
        spawnSync('taskkill', ['/F', '/PID', pid], {windowsHide: true, stdio: 'ignore'})
    }
    return pids.size > 0
}

/**
 * Kill other ops node processes; never kill skipPids (e.g. current menu).
 * @param {{quiet?: boolean, skipPids?: number[]}} [opts]
 */
function killOpsNode(opts = {}) {
    const quiet = Boolean(opts.quiet)
    const skip = new Set((opts.skipPids || []).map(Number).filter((n) => n > 0))
    skip.add(process.pid)

    if (isWin) {
        const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$quiet = $${quiet ? 'true' : 'false'}
$root = ${JSON.stringify(ROOT)}
$skip = @(${[...skip].join(',') || '0'})
$patterns = @('ops-web.mjs','ops-cli.mjs','ship-release-menu.mjs')
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  if ($skip -contains $_.ProcessId) { return }
  $cmd = $_.CommandLine
  if (-not $cmd) { return }
  if ($cmd -like '*ops-close.mjs*') { return }
  $hit = $false
  foreach ($p in $patterns) { if ($cmd -like ('*' + $p + '*')) { $hit = $true; break } }
  if (-not $hit) { return }
  if ($cmd -notlike ('*' + $root + '*') -and $cmd -notlike '*datawise-cli*') { return }
  if (-not $quiet) { Write-Host ('  - kill node PID ' + $_.ProcessId) }
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
`
        spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
            stdio: quiet ? 'ignore' : 'inherit',
            windowsHide: true,
        })
        return
    }

    for (const pat of ['ops-web\\.mjs', 'ops-cli\\.mjs', 'ship-release-menu\\.mjs']) {
        try {
            spawnSync('pkill', ['-f', pat], {stdio: 'ignore'})
        } catch {
            // ignore
        }
    }
}

/**
 * @param {{quiet?: boolean, skipPids?: number[]}} [opts]
 */
export function closeOps(opts = {}) {
    const quiet = Boolean(opts.quiet)
    if (!quiet) {
        console.log('')
        console.log('Closing DataWise Ops…')
        console.log('')
    }
    const portHit = killPort(PORT, {quiet})
    if (!quiet && !portHit) console.log(`  - no listener on port ${PORT}`)
    killOpsNode({quiet, skipPids: opts.skipPids})
    if (!quiet) {
        console.log('')
        console.log('Done.')
        console.log('')
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    closeOps({quiet: false, skipPids: [process.pid]})
}
