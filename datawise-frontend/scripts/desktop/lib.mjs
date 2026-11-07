/**
 * Shared helpers for desktop packaging (process control + filesystem).
 * Maven helpers live in ./maven.mjs.
 */
import {execSync, spawnSync} from 'node:child_process'
import {cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {frontendRoot} from './paths.mjs'

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'ENOTEMPTY', 'EACCES', 'EIO'])

export function log(tag, msg) {
    console.log(`[${tag}] ${msg}`)
}

export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
}

/**
 * Whether this file is the Node entrypoint.
 * Pass the caller's `import.meta.url` — using lib's own meta would always be false.
 */
export function isDirectRun(importMetaUrl) {
    const entry = process.argv[1]
    if (!entry || !importMetaUrl) return false
    try {
        return fileURLToPath(importMetaUrl) === resolve(entry)
    } catch {
        return false
    }
}

export function run(cmd, args, cwd = frontendRoot) {
    log('desktop', `${cmd} ${args.join(' ')}`.trim())
    const result = spawnSync(cmd, args, {
        cwd,
        stdio: 'inherit',
        env: process.env,
        shell: process.platform === 'win32',
    })
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}

export function runNpm(script) {
    run('npm', ['run', script], frontendRoot)
}

export function stopDesktopProcesses() {
    if (process.platform === 'win32') {
        killImage('DataWiseCLI.exe')
        killImage('DataWise CLI.exe')

        const wmicFilters = [
            "CommandLine like '%datawise-server%'",
            "CommandLine like '%resources\\\\desktop%'",
            "CommandLine like '%resources/desktop%'",
            "CommandLine like '%DatawiseDesktopApp%'",
            "CommandLine like '%DatawiseBackendApplication%'",
            "CommandLine like '%datawise-desktop.jar%'",
            "CommandLine like '%datawise-desktop%dist%windows%'",
            "CommandLine like '%datawise.gui%'",
            "CommandLine like '%datawise-frontend%release%'",
            "CommandLine like '%DataWiseCLI-%setup%'",
        ]
        for (const filter of wmicFilters) {
            try {
                const raw = execSync(
                    `wmic process where "${filter}" get ProcessId`,
                    {encoding: 'utf8', windowsHide: true},
                )
                for (const line of raw.split(/\r?\n/)) {
                    const pid = line.trim()
                    if (/^\d+$/.test(pid)) {
                        killTask(`taskkill /F /PID ${pid} /T`)
                    }
                }
            } catch {
                // wmic unavailable or no matches
            }
        }

        // PowerShell fallback when wmic is missing (newer Windows)
        try {
            execSync(
                `powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'DatawiseDesktopApp|DatawiseBackendApplication|datawise-desktop\\.jar|datawise-server|datawise\\.gui|datawise-frontend\\\\release|DataWiseCLI-.*-setup' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
                {stdio: 'ignore', windowsHide: true},
            )
        } catch {
            // ignore
        }

        // Release-folder installers lock setup.exe during dist rebuild (EIO on cpSync unlink).
        try {
            execSync(
                `powershell.exe -NoProfile -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*datawise-frontend*release*' -or $_.Path -like '*installer*ui*release-nsis*' -or $_.Path -like '*installer*ui*release-portable*' -or $_.Path -like '*installer*ui*win-unpacked*' } | Stop-Process -Force -ErrorAction SilentlyContinue"`,
                {stdio: 'ignore', windowsHide: true},
            )
        } catch {
            // ignore
        }
    } else {
        killTask('pkill -f "datawise-server"')
        killTask('pkill -f "DataWise CLI"')
        killTask('pkill -f "DatawiseDesktopApp"')
        killTask('pkill -f "DatawiseBackendApplication"')
        killTask('pkill -f "datawise-desktop.jar"')
        killTask('pkill -f "datawise.gui"')
    }
    log('stop-desktop', 'stale desktop/backend processes stopped (if any)')
}

function killImage(imageName) {
    killTask(`taskkill /F /IM "${imageName}" /T`)
}

function killTask(cmd) {
    try {
        execSync(cmd, {stdio: 'ignore', windowsHide: true})
    } catch {
        // process may already be gone
    }
}

export async function removePathRobust(path, {onRetry, tag = 'desktop'} = {}) {
    if (!existsSync(path)) return

    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            rmSync(path, {recursive: true, force: true, maxRetries: 3, retryDelay: 300})
            log(tag, `removed ${path}`)
            return
        } catch (error) {
            const code = error?.code ?? ''
            const message = error instanceof Error ? error.message : String(error)
            if (!RETRYABLE.has(code) || attempt === 5) {
                const stale = `${path}.stale-${Date.now()}`
                try {
                    renameSync(path, stale)
                    log(tag, `could not delete ${path}; renamed to ${stale}`)
                    return
                } catch {
                    throw new Error(
                        `Cannot remove ${path} (${code || message}). ` +
                            'Close DataWise CLI and any File Explorer window on this folder, ' +
                            'then run: npm run stop:desktop',
                        {cause: error},
                    )
                }
            }
            log(tag, `remove attempt ${attempt}/5 failed (${code})`)
            onRetry?.()
            await sleep(800 * attempt)
        }
    }
}

/**
 * Copy a file over an existing destination, tolerating Windows locks on release assets.
 * Writes to a temp sibling first, then replaces the target (rename stale if still locked).
 */
export async function copyFileRobust(src, dest, {onRetry, tag = 'desktop'} = {}) {
    mkdirSync(dirname(dest), {recursive: true})
    const tmp = `${dest}.build-${process.pid}-${Date.now()}`
    cpSync(src, tmp, {force: true})

    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            if (existsSync(dest)) {
                rmSync(dest, {force: true, maxRetries: 3, retryDelay: 300})
            }
            renameSync(tmp, dest)
            log(tag, `copied → ${dest}`)
            return
        } catch (error) {
            const code = error?.code ?? ''
            const message = error instanceof Error ? error.message : String(error)
            const retryable = RETRYABLE.has(code) || /access is denied/i.test(message)
            if (!retryable || attempt === 5) {
                try {
                    if (existsSync(dest)) {
                        const stale = `${dest}.stale-${Date.now()}`
                        renameSync(dest, stale)
                        log(tag, `renamed locked ${dest} → ${stale}`)
                    }
                    renameSync(tmp, dest)
                    log(tag, `copied → ${dest}`)
                    return
                } catch (finalError) {
                    try {
                        rmSync(tmp, {force: true})
                    } catch {
                        // ignore
                    }
                    throw new Error(
                        `Cannot replace ${dest} (${code || message}). ` +
                            'Close any running setup/installer from release/, then run: npm run stop',
                        {cause: finalError},
                    )
                }
            }
            log(tag, `replace attempt ${attempt}/5 failed (${code || message})`)
            onRetry?.()
            await sleep(800 * attempt)
        }
    }
}

export function copyDirSync(src, dest) {
    mkdirSync(dest, {recursive: true})
    cpSync(src, dest, {recursive: true, force: true})
}

function sleepSync(ms) {
    try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
    } catch {
        const end = Date.now() + ms
        while (Date.now() < end) {
            // spin — only used for short Windows zip retries
        }
    }
}

/**
 * Zip the *contents* of {@code sourceDir} into {@code zipPath}
 * (zip root = children of sourceDir, same as Compress-Archive -Path dir\\*).
 *
 * Windows: prefer {@code tar.exe -a} (avoids Compress-Archive exclusive locks /
 * Defender races on freshly copied assets), then .NET ZipFile with retries.
 */
export function zipDirectoryContents(sourceDir, zipPath, {tag = 'desktop'} = {}) {
    if (!existsSync(sourceDir)) {
        throw new Error(`zip source missing: ${sourceDir}`)
    }
    mkdirSync(dirname(zipPath), {recursive: true})
    if (existsSync(zipPath)) {
        rmSync(zipPath, {force: true, maxRetries: 3, retryDelay: 200})
    }

    if (process.platform !== 'win32') {
        const result = spawnSync('zip', ['-r', zipPath, '.'], {
            cwd: sourceDir,
            encoding: 'utf8',
            stdio: 'inherit',
        })
        if (result.status !== 0 || !existsSync(zipPath)) {
            throw new Error(`zip failed for ${zipPath} (exit ${result.status ?? 'null'})`)
        }
        log(tag, `zipped → ${zipPath}`)
        return
    }

    // Let Defender / Search Indexer release handles on freshly copied trees.
    sleepSync(400)

    const psSrc = sourceDir.replace(/'/g, "''")
    const psDest = zipPath.replace(/'/g, "''")
    const zipFilePs = [
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        `$src = '${psSrc}'`,
        `$dest = '${psDest}'`,
        'if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }',
        '[System.IO.Compression.ZipFile]::CreateFromDirectory($src, $dest)',
    ].join('; ')

    let lastDetail = ''
    for (let attempt = 1; attempt <= 5; attempt++) {
        if (existsSync(zipPath)) {
            try {
                rmSync(zipPath, {force: true})
            } catch {
                // retry below
            }
        }

        const tar = spawnSync(
            'tar.exe',
            ['-a', '-c', '-f', zipPath, '-C', sourceDir, '.'],
            {encoding: 'utf8', windowsHide: true},
        )
        if (tar.status === 0 && existsSync(zipPath) && statSync(zipPath).size > 0) {
            log(tag, `zipped (tar) → ${zipPath}`)
            return
        }
        lastDetail = String(tar.stderr || tar.stdout || '').trim()

        const zipFile = spawnSync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', zipFilePs],
            {encoding: 'utf8', windowsHide: true},
        )
        if (zipFile.status === 0 && existsSync(zipPath) && statSync(zipPath).size > 0) {
            log(tag, `zipped (ZipFile) → ${zipPath}`)
            return
        }
        lastDetail = String(zipFile.stderr || zipFile.stdout || lastDetail).trim()
        log(tag, `zip attempt ${attempt}/5 failed${lastDetail ? `: ${lastDetail.slice(0, 240)}` : ''}`)
        if (attempt < 5) {
            sleepSync(600 * attempt)
        }
    }

    throw new Error(
        `Cannot create ${zipPath} (file in use). Close File Explorer windows on the build folder, ` +
            'pause real-time AV scan if needed, then retry. Last error: ' +
            (lastDetail || 'unknown'),
    )
}

export function copyJarFiles(srcDir, destDir, suffix = '.jar', matcher = null) {
    if (!existsSync(srcDir)) return 0
    mkdirSync(destDir, {recursive: true})
    let count = 0
    for (const name of readdirSync(srcDir)) {
        if (!name.endsWith(suffix)) continue
        if (matcher && !matcher(name)) continue
        cpSync(join(srcDir, name), join(destDir, name))
        count++
    }
    return count
}

/** Locate the newest datawise-server-*.jar under the packaging target dir (no content validation). */
export function findServerJar(serverTargetDir) {
    if (!existsSync(serverTargetDir)) {
        throw new Error(`Missing ${serverTargetDir} — run Maven build for datawise-server first`)
    }
    const candidates = readdirSync(serverTargetDir)
        .filter((name) =>
            name.startsWith('datawise-server-')
            && name.endsWith('.jar')
            && !name.endsWith('.jar.original')
            && !name.includes('-sources')
            && !name.includes('-javadoc')
            && !name.includes('-plain'),
        )
        .map((name) => join(serverTargetDir, name))
        .sort((a, b) => {
            // Prefer newest mtime, then longer name (version) as tiebreaker.
            try {
                return statSync(b).mtimeMs - statSync(a).mtimeMs
            } catch {
                return b.localeCompare(a)
            }
        })
    if (!candidates.length) {
        throw new Error(`No datawise-server-*.jar in ${serverTargetDir}`)
    }
    return candidates[0]
}

/**
 * Locate server JAR and validate Spring Boot contents (used after Maven packaging).
 */
export function resolveServerJar(serverTargetDir) {
    const jar = findServerJar(serverTargetDir)
    assertSpringBootJarHasMainClass(jar, 'org/apache/datawise/backend/DatawiseBackendApplication.class')
    return jar
}

/**
 * Fail fast if the boot jar is incomplete (corrupt package or incomplete build).
 */
export function assertSpringBootJarHasMainClass(jarPath, classPathInJar) {
    const listing = execSync(`jar tf "${jarPath}"`, {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
    })
    const bootClassEntry = `BOOT-INF/classes/${classPathInJar.replace(/^\/+/, '')}`
    if (!listing.split(/\r?\n/).includes(bootClassEntry)) {
        throw new Error(
            `Broken Spring Boot JAR: missing ${bootClassEntry} in ${jarPath}. ` +
                'Re-run: npm run build:backend (writes to target/).',
        )
    }
    const classCount = listing.split(/\r?\n/).filter(
        (line) => line.startsWith('BOOT-INF/classes/') && line.endsWith('.class'),
    ).length
    if (classCount < 20) {
        throw new Error(
            `Broken Spring Boot JAR: only ${classCount} classes in BOOT-INF/classes (${jarPath}). ` +
                'Re-run: npm run build:backend',
        )
    }
    log('desktop', `validated boot jar (${classCount} classes): ${jarPath}`)
}

if (isDirectRun(import.meta.url) && process.argv.includes('--stop-processes')) {
    stopDesktopProcesses()
}
