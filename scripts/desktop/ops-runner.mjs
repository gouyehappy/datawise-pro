/**
 * Run a catalog action; stream output to callbacks.
 * Prefer launchInNewWindow / runAction(..., {newWindow:true}) so the ops menu stays free.
 */
import {spawn, spawnSync} from 'node:child_process'
import {readFileSync, writeFileSync, unlinkSync, mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {findAction} from './ops-catalog.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const isWin = process.platform === 'win32'

/** @param {string} s */
function quoteCmdArg(s) {
    const t = String(s)
    if (!/[ \t"&<>|^%!]/.test(t)) return t
    return `"${t.replace(/"/g, '""')}"`
}

/**
 * Open a new console and run argv there. Ops menu window stays put.
 * On Windows, write a temp .cmd then `start` it — avoids `start`/`&`/`echo.` quoting bugs
 * that surface as "'\\echo' is not recognized".
 * @param {string} title
 * @param {string[]} argv program + args
 * @param {{env?: Record<string,string>}} [opts]
 * @returns {boolean}
 */
export function launchInNewWindow(title, argv, opts = {}) {
    if (!argv?.length) return false
    const safeTitle = String(title || 'DataWise').replace(/[\r\n"]/g, ' ').slice(0, 64)
    const env = {...process.env, ...opts.env}
    const cmdline = argv.map(quoteCmdArg).join(' ')

    if (isWin) {
        const dir = join(tmpdir(), 'datawise-ops')
        try {
            mkdirSync(dir, {recursive: true})
        } catch {
            // ignore
        }
        const bat = join(dir, `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.cmd`)
        // UTF-8 no BOM; ASCII-safe footer to avoid cmd codepage issues
        const body = [
            '@echo off',
            'setlocal EnableExtensions',
            'chcp 65001 >nul',
            `cd /d ${quoteCmdArg(ROOT)}`,
            'echo.',
            `echo [DataWise] ${safeTitle}`,
            'echo.',
            cmdline,
            'set ERR=%ERRORLEVEL%',
            'echo.',
            'if not "%ERR%"=="0" echo [DataWise] exit code %ERR%',
            'echo [DataWise] finished. You can close this window.',
            'endlocal',
            '',
        ].join('\r\n')
        writeFileSync(bat, body, 'utf8')

        // PowerShell Start-Process：独立控制台，避免 cmd `start` 抢父子进程/标题解析导致菜单异常退出 (-1)
        const ps = [
            `$p = Start-Process -FilePath 'cmd.exe'`,
            `-ArgumentList @('/k','call ${bat.replace(/'/g, "''")}')`,
            `-WorkingDirectory ${JSON.stringify(ROOT)}`,
            `-WindowStyle Normal`,
            `-PassThru`,
            `; if (-not $p) { exit 1 }`,
        ].join(' ')
        const launched = spawnSync(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
            {cwd: ROOT, env, windowsHide: true, encoding: 'utf8'},
        )
        if ((launched.status ?? 1) !== 0) {
            // fallback: classic start with explicit empty title
            const child = spawn(
                'cmd.exe',
                ['/c', 'start', 'DataWise', 'cmd.exe', '/k', `call ${quoteCmdArg(bat)}`],
                {detached: true, stdio: 'ignore', windowsHide: true, cwd: ROOT, env},
            )
            child.on('error', () => {})
            child.unref()
        }
        // Temp scripts under %TEMP%\datawise-ops; best-effort cleanup after a while
        setTimeout(() => {
            try {
                unlinkSync(bat)
            } catch {
                // still open or already gone
            }
        }, 300_000)
        return true
    }

    if (process.platform === 'darwin') {
        const escaped = cmdline.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        const script = `tell application "Terminal" to do script "cd ${ROOT.replace(/"/g, '\\"')} && ${escaped}"`
        spawn('osascript', ['-e', script], {detached: true, stdio: 'ignore', env}).unref()
        return true
    }

    // Linux: try common terminals
    const cdCmd = `cd ${quoteCmdArg(ROOT)} && ${cmdline}; echo; echo '[DataWise] finished.'; exec bash`
    for (const [bin, args] of [
        ['gnome-terminal', ['--', 'bash', '-lc', cdCmd]],
        ['konsole', ['-e', 'bash', '-lc', cdCmd]],
        ['x-terminal-emulator', ['-e', 'bash', '-lc', cdCmd]],
    ]) {
        try {
            const child = spawn(bin, args, {detached: true, stdio: 'ignore', env})
            child.on('error', () => {})
            child.unref()
            return true
        } catch {
            // try next
        }
    }
    return false
}

/**
 * Resolve catalog action → [cmd, ...args]
 * @param {object} action
 * @returns {[string, ...string[]]}
 */
export function actionToArgv(action) {
    if (action.kind === 'dw') {
        return [process.execPath, join(ROOT, 'scripts', 'dw.mjs'), action.script, ...(action.args || [])]
    }
    if (action.kind === 'npm') {
        const args = ['run', action.script]
        if (action.args?.length) args.push('--', ...action.args)
        return [isWin ? 'npm.cmd' : 'npm', ...args]
    }
    if (action.kind === 'node') {
        return [process.execPath, join(ROOT, action.script), ...(action.args || [])]
    }
    throw new Error(`bad kind: ${action.kind}`)
}

/**
 * @param {string} actionId
 * @param {{onData?:(s:string)=>void, env?:Record<string,string>, newWindow?:boolean}} [opts]
 * @returns {Promise<{code:number, action:object, newWindow?:boolean}>}
 */
export function runAction(actionId, opts = {}) {
    const action = findAction(actionId)
    if (!action) {
        return Promise.reject(new Error(`unknown action: ${actionId}`))
    }

    const argv = actionToArgv(action)
    if (opts.newWindow) {
        const ok = launchInNewWindow(action.title || actionId, argv, {env: opts.env})
        return Promise.resolve({code: ok ? 0 : 1, action, newWindow: true})
    }

    const [cmd, ...args] = argv
    return new Promise((resolve) => {
        // Windows: *.cmd 不能 shell:false 直 spawn（Node 24 EINVAL）；走 cmd /c 单行
        let bin = cmd
        let binArgs = args
        if (isWin && /\.cmd$/i.test(cmd)) {
            bin = 'cmd.exe'
            binArgs = ['/d', '/s', '/c', [cmd, ...args].map(quoteCmdArg).join(' ')]
        }
        const child = spawn(bin, binArgs, {
            cwd: ROOT,
            env: {...process.env, ...opts.env},
            shell: false,
            windowsHide: true,
        })
        const onData = (buf) => {
            const text = buf.toString('utf8')
            if (opts.onData) opts.onData(text)
        }
        child.stdout?.on('data', onData)
        child.stderr?.on('data', onData)
        child.on('close', (code) => resolve({code: code ?? 1, action}))
        child.on('error', (err) => {
            if (opts.onData) opts.onData(String(err.message || err))
            resolve({code: 1, action})
        })
    })
}

export function readStatus() {
    let version = '?'
    try {
        const xml = readFileSync(join(ROOT, 'datawise-backend', 'pom.xml'), 'utf8')
        const m = xml.match(/<artifactId>datawise-backend<\/artifactId>\s*<version>([^<]+)<\/version>/)
        if (m) version = m[1].trim()
    } catch {
        // ignore
    }
    const branch = spawnSync('git', ['branch', '--show-current'], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
    })
    const dirty = spawnSync('git', ['status', '--porcelain'], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
    })
    const tag = spawnSync('git', ['describe', '--tags', '--abbrev=0'], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
    })
    const dirtyList = (dirty.stdout || '').trim()
    const dow = new Date().getDay()
    return {
        version,
        branch: (branch.stdout || '').trim() || '?',
        latestTag: (tag.status === 0 ? (tag.stdout || '').trim() : '') || '(none)',
        dirtyCount: dirtyList ? dirtyList.split('\n').filter(Boolean).length : 0,
        dirty: Boolean(dirtyList),
        weekday: dow >= 1 && dow <= 5,
        hasCnbToken: Boolean(process.env.CNB_TOKEN),
    }
}

export {ROOT}
