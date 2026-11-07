/**
 * Build DataWise desktop (JCEF host) for the current OS.
 *
 * Usage:
 * node scripts/build-desktop.mjs [--profile slim|core|full] [--skip-backend] [--dir] [--publish]
 * [--no-installer] [--installer=inno|wix]
 *
 * Output (default profile=core - updater-stable names without profile token):
 * datawise-desktop/dist/{windows|linux|macos}/
 * datawise-frontend/release/DataWiseCLI-{version}-{os}-{arch}.zip
 * datawise-frontend/release/DataWiseCLI-{version}-windows-x64-setup.exe
 * datawise-frontend/release/size-report-{profile}.json
 *
 * Non-core profiles insert `-{slim|full}` before os/arch so Releases stay unambiguous:
 * DataWiseCLI-{version}-slim-windows-x64.zip
 */
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {
    chmodSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import {arch as osArch, platform as osPlatform} from 'node:os'
import {basename, dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {
    copyFileRobust,
    removePathRobust,
    stopDesktopProcesses,
    zipDirectoryContents,
} from '../../datawise-frontend/scripts/desktop/lib.mjs'
import {stripJreBloat} from '../../datawise-frontend/scripts/desktop/jlink-jre.mjs'
import {ensureJbrJcef} from './ensure-jbr-jcef.mjs'
import {githubHttps, resolveRepoIdentity} from '../../scripts/repo-identity.mjs'
import {ensureInnoSetup} from './ensure-inno-setup.mjs'

const scriptDir = join(fileURLToPath(import.meta.url), '..')
const desktopRoot = join(scriptDir, '..')
const repoRoot = join(desktopRoot, '..')
const frontendRoot = join(repoRoot, 'datawise-frontend')

function log(msg) {
    console.log(`[dist:desktop] ${msg}`)
}

/** Fail fast when layout / jpackage output is missing critical desktop assets. */
function validateDesktopLayout(layoutDir, target, {jpackageRoot} = {}) {
    const errors = []
    const indexHtml = join(layoutDir, 'frontend-dist', 'index.html')
    if (!existsSync(indexHtml)) {
        errors.push(`missing ${indexHtml}`)
    }
    const serverJar = join(layoutDir, 'backend', 'datawise-server.jar')
    if (!existsSync(serverJar)) {
        errors.push(`missing ${serverJar}`)
    }
    const localVersion = join(layoutDir, 'local_version.json')
    const localVersionNested = target.osKey === 'macos'
        ? join(layoutDir, 'DataWiseCLI.app', 'Contents', 'local_version.json')
        : join(layoutDir, 'resources', 'local_version.json')
    if (!existsSync(localVersion) && !existsSync(localVersionNested)) {
        errors.push('missing local_version.json')
    }
    const badNested = join(layoutDir, 'backend', 'lib', 'frontend-dist', 'index.html')
    if (existsSync(badNested)) {
        errors.push(`invalid nested frontend-dist at ${badNested}`)
    }
    if (target.osKey === 'macos') {
        const fwCandidates = [
            join(layoutDir, 'Frameworks', 'Chromium Embedded Framework.framework'),
            join(layoutDir, 'DataWiseCLI.app', 'Contents', 'Frameworks', 'Chromium Embedded Framework.framework'),
        ]
        if (jpackageRoot) {
            fwCandidates.push(
                join(jpackageRoot, 'Contents', 'Frameworks', 'Chromium Embedded Framework.framework'),
            )
        }
        if (!fwCandidates.some((p) => existsSync(p))) {
            errors.push('missing macOS Chromium Embedded Framework.framework')
        }
    }
    if (errors.length > 0) {
        console.error('[dist:desktop] package validation failed:')
        for (const err of errors) {
            console.error(` - ${err}`)
        }
        process.exit(1)
    }
    log('package validation OK')
}

function readVersion() {
    const pkg = JSON.parse(readFileSync(join(frontendRoot, 'package.json'), 'utf8'))
    return String(pkg.version || '0.0.0')
}

function sha256File(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Package-local version manifest (foundation for incremental updates).
 * Written next to backend/frontend-dist and into jpackage resource roots.
 */
function writeLocalVersionManifest(dir, version, target) {
    const files = {}
    const serverJar = join(dir, 'backend', 'datawise-server.jar')
    if (existsSync(serverJar)) {
        const st = statSync(serverJar)
        files['backend/datawise-server.jar'] = {sha256: sha256File(serverJar), bytes: st.size}
    }
    const indexHtml = join(dir, 'frontend-dist', 'index.html')
    if (existsSync(indexHtml)) {
        const st = statSync(indexHtml)
        files['frontend-dist/index.html'] = {sha256: sha256File(indexHtml), bytes: st.size}
    }
    const manifest = {
        schema: 1,
        version: String(version),
        platform: `${target.osKey}-${target.zipArch}`,
        builtAt: new Date().toISOString(),
        files,
    }
    writeFileSync(join(dir, 'local_version.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function run(cmd, args, cwd = repoRoot) {
    const result = spawnSync(cmd, args, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: process.env,
    })
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}

/**
 * Copy large directory trees via OS tools on macOS/Linux to avoid Node OOM
 * on CEF Frameworks / .app bundles (fs.cpSync holds too much in-process).
 */
function copyTree(src, dest) {
    if (!existsSync(src)) {
        return
    }
    const st = statSync(src)
    if (!st.isDirectory()) {
        mkdirSync(dirname(dest), {recursive: true})
        cpSync(src, dest)
        return
    }
    if (existsSync(dest)) {
        rmSync(dest, {recursive: true, force: true})
    }
    mkdirSync(dirname(dest), {recursive: true})
    if (process.platform === 'darwin') {
        // ditto preserves symlinks / resource forks used by CEF .framework bundles
        run('ditto', [src, dest], repoRoot)
        return
    }
    if (process.platform === 'linux') {
        mkdirSync(dest, {recursive: true})
        run('cp', ['-a', `${src}/.`, dest], repoRoot)
        return
    }
    cpSync(src, dest, {recursive: true})
}

const DESKTOP_PROFILES = new Set(['slim', 'core', 'full'])

/** @param {string|undefined} raw */
function normalizeProfile(raw) {
    const profile = String(raw || 'core').trim().toLowerCase()
    if (!DESKTOP_PROFILES.has(profile)) {
        console.error(`[dist:desktop] unknown profile "${raw}". Use: slim | core | full`)
        process.exit(1)
    }
    return profile
}

/** core keeps updater-stable names; slim/full get an explicit token. */
function profileArtifactToken(profile) {
    return profile === 'core' ? '' : `-${profile}`
}

function parseArgs(argv) {
    const profileEq = argv.find((a) => a.startsWith('--profile='))
    const profileIdx = argv.indexOf('--profile')
    const installerArg = argv.find((a) => a.startsWith('--installer='))
    /** @type {'inno'|'wix'|'auto'} */
    let installerKind = 'auto'
    if (installerArg) {
        const v = installerArg.split('=')[1]
        if (v === 'inno' || v === 'wix') {
            installerKind = v
        }
    }
    let profileRaw = 'core'
    if (profileEq) profileRaw = profileEq.split('=')[1]
    else if (profileIdx >= 0 && argv[profileIdx + 1]) profileRaw = argv[profileIdx + 1]
    else if (process.env.DATAWISE_DESKTOP_PROFILE) profileRaw = process.env.DATAWISE_DESKTOP_PROFILE
    return {
        profile: normalizeProfile(profileRaw),
        skipBackend: argv.includes('--skip-backend'),
        dir: argv.includes('--dir'),
        publish: argv.includes('--publish'),
        // Native installer (Win Setup / Mac DMG / Linux deb). Default on.
        installer: !argv.includes('--no-installer'),
        installerKind,
    }
}

/** @returns {{osKey: string, distDir: string, zipArch: string}} */
function resolveTarget() {
    const plat = osPlatform()
    const cpu = osArch()
    const zipArch = cpu === 'arm64' || cpu === 'aarch64' ? 'arm64' : 'x64'
    if (plat === 'win32') {
        return {osKey: 'windows', distDir: 'windows', zipArch: 'x64'}
    }
    if (plat === 'darwin') {
        return {osKey: 'macos', distDir: 'macos', zipArch}
    }
    if (plat === 'linux') {
        return {osKey: 'linux', distDir: 'linux', zipArch}
    }
    console.error(`[dist:desktop] unsupported platform: ${plat}`)
    process.exit(1)
}

function curlBin() {
    return process.platform === 'win32' ? 'curl.exe' : 'curl'
}

async function bundleBackend(profile) {
    log(`bundling backend (profile=${profile})...`)
    run('node', ['scripts/desktop/bundle-backend.mjs', `--profile=${profile}`], frontendRoot)
}

function buildFrontend() {
    log('building Vue frontend (desktop base ./)...')
    run('npm', ['run', 'build:desktop'], frontendRoot)
}

function copyDir(src, dest) {
    if (!existsSync(src)) return false
    mkdirSync(dest, {recursive: true})
    cpSync(src, dest, {recursive: true})
    return true
}

const SERVER_JVM_OPTS = [
    '-Ddatawise.packaged=true',
    '-Ddatawise.gui=true',
    '-Ddatawise.install.root=$ROOTDIR',
    '-Dfile.encoding=UTF-8',
    '-Djava.awt.headless=false',
    '-Dsun.java2d.d3d=false',
    // AppCDS: JVM fail-open if archive missing/corrupt. Disable by deleting datawise.jsa
    // or setting DATAWISE_DISABLE_APPCDS=1 on the .cmd/.sh fallback launchers.
    '-XX:SharedArchiveFile=$APPDIR/datawise.jsa',
    '--add-opens=java.desktop/sun.awt=ALL-UNNAMED',
    '--add-opens=java.desktop/sun.lwawt=ALL-UNNAMED',
    '--add-opens=java.desktop/sun.lwawt.macosx=ALL-UNNAMED',
    '--add-opens=java.desktop/com.apple.eawt=ALL-UNNAMED',
]

function writeWindowsLauncher(out) {
    const launcher = [
        '@echo off',
        'setlocal',
        'cd /d "%~dp0"',
        'if exist "DataWiseCLI.exe" (',
        ' start "" /D "%~dp0" "%~dp0DataWiseCLI.exe" %*',
        ' exit /b %ERRORLEVEL%',
        ')',
        'set DATAWISE_PACKAGED=true',
        'set DATAWISE_GUI=true',
        'set DATAWISE_INSTALL_ROOT=%CD%',
        'set "JAVA=java"',
        'if exist "runtime\\bin\\java.exe" set "JAVA=runtime\\bin\\java.exe"',
        'if not exist "backend\\datawise-server.jar" (',
        ' echo Missing backend\\datawise-server.jar',
        ' exit /b 1',
        ')',
        'set "CDS_OPT="',
        'if /I not "%DATAWISE_DISABLE_APPCDS%"=="1" if exist "backend\\datawise.jsa" (',
        ' set "CDS_OPT=-XX:SharedArchiveFile=%CD%\\backend\\datawise.jsa"',
        ')',
        `"%JAVA%" %CDS_OPT% -Ddatawise.packaged=true -Ddatawise.gui=true -Ddatawise.install.root="%CD%" -Ddatawise.github.repo=${resolveRepoIdentity().slug} -Dfile.encoding=UTF-8 -Djava.awt.headless=false -Dsun.java2d.d3d=false -jar "backend\\datawise-server.jar" %*`,
        '',
    ].join('\r\n')
    writeFileSync(join(out, 'DataWiseCLI.cmd'), launcher, 'utf8')
}

function writeUnixLauncher(out) {
    const launcher = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -x "./DataWiseCLI" ]]; then
  exec ./DataWiseCLI "$@"
fi
if [[ -x "./DataWiseCLI.app/Contents/MacOS/DataWiseCLI" ]]; then
  exec ./DataWiseCLI.app/Contents/MacOS/DataWiseCLI "$@"
fi
export DATAWISE_PACKAGED=true
export DATAWISE_GUI=true
export DATAWISE_INSTALL_ROOT="$PWD"
JAVA=java
if [[ -x "runtime/bin/java" ]]; then
  JAVA="runtime/bin/java"
elif [[ -x "DataWiseCLI.app/Contents/runtime/bin/java" ]]; then
  JAVA="DataWiseCLI.app/Contents/runtime/bin/java"
fi
JAR="backend/datawise-server.jar"
if [[ ! -f "$JAR" ]]; then
  echo "Missing $JAR" >&2
  exit 1
fi
CDS_OPT=()
if [[ "\${DATAWISE_DISABLE_APPCDS:-}" != "1" && -f "backend/datawise.jsa" ]]; then
  CDS_OPT=(-XX:SharedArchiveFile="$PWD/backend/datawise.jsa")
fi
exec "$JAVA" \\
  "\${CDS_OPT[@]}" \\
  -Ddatawise.packaged=true \\
  -Ddatawise.gui=true \\
  -Ddatawise.install.root="$PWD" \\
  -Ddatawise.github.repo=${resolveRepoIdentity().slug} \\
  -Dfile.encoding=UTF-8 \\
  -Djava.awt.headless=false \\
  -jar "$JAR" "$@"
`
    const path = join(out, 'DataWiseCLI.sh')
    writeFileSync(path, launcher, 'utf8')
    try {
        chmodSync(path, 0o755)
    } catch {
        // best-effort on Windows checkout
    }
}

/**
 * @param {string} version
 * @param {{osKey: string, distDir: string, zipArch: string}} target
 * @param {{home: string, frameworks: string|null}} jbr
 */
async function assembleLayout(version, target, jbr) {
    const out = join(desktopRoot, 'dist', target.distDir)
    // Running DataWiseCLI.cmd / .exe locks this folder on Windows (EPERM on rm).
    stopDesktopProcesses()
    await removePathRobust(out, {
        tag: 'dist:desktop',
        onRetry: stopDesktopProcesses,
    })
    mkdirSync(out, {recursive: true})

    const feDist = join(frontendRoot, 'dist')
    const beSrc = join(frontendRoot, 'resources', 'desktop', 'backend')
    // Prepared by bundle-backend.mjs (profile marker, plugins, runtime-catalog) - 
    // not the raw template under resources/bundle-config.
    const cfgSrc = join(frontendRoot, 'resources', 'desktop', 'config-bundle')
    const iconsSrc = join(desktopRoot, 'src', 'main', 'resources', 'icons')

    if (!copyDir(feDist, join(out, 'frontend-dist'))) {
        console.error('[dist:desktop] frontend dist missing - run npm run build')
        process.exit(1)
    }
    if (!copyDir(beSrc, join(out, 'backend'))) {
        console.error('[dist:desktop] backend bundle missing - run prepare:desktop')
        process.exit(1)
    }
    const serverJar = join(out, 'backend', 'datawise-server.jar')
    if (!existsSync(serverJar)) {
        console.error('[dist:desktop] missing backend/datawise-server.jar')
        process.exit(1)
    }
    // Drop any leftover nested JRE from older bundles.
    const staleJre = join(out, 'backend', 'jre')
    if (existsSync(staleJre)) {
        rmSync(staleJre, {recursive: true, force: true})
    }
    if (!copyDir(cfgSrc, join(out, 'config-bundle'))) {
        console.error('[dist:desktop] config-bundle missing - run prepare:desktop / bundle-backend')
        process.exit(1)
    }
    if (!existsSync(join(out, 'config-bundle', 'desktop-packaging.json'))) {
        console.error('[dist:desktop] missing config-bundle/desktop-packaging.json - re-run bundle-backend')
        process.exit(1)
    }
    copyDir(iconsSrc, join(out, 'icons'))
    writeLocalVersionManifest(out, version, target)

    wrapWithJpackage(out, version, target, jbr)

    if (target.osKey === 'windows') {
        writeWindowsLauncher(out)
    } else {
        writeUnixLauncher(out)
    }

    // Ensure layout root always has the manifest (after jpackage reshape).
    writeLocalVersionManifest(out, version, target)
    if (target.osKey === 'macos') {
        const contents = join(out, 'DataWiseCLI.app', 'Contents')
        if (existsSync(contents)) {
            writeLocalVersionManifest(contents, version, target)
        }
    } else if (existsSync(join(out, 'resources'))) {
        writeLocalVersionManifest(join(out, 'resources'), version, target)
    }

    const runHint =
        target.osKey === 'windows'
            ? 'Run: DataWiseCLI.exe (preferred)\n or: DataWiseCLI.cmd'
            : target.osKey === 'macos'
              ? 'Run: ./DataWiseCLI.sh or open DataWiseCLI.app'
              : 'Run: ./DataWiseCLI.sh or ./DataWiseCLI'

    if (target.osKey === 'windows') {
        const uninstallSrc = join(desktopRoot, 'jpackage-resources', 'windows', 'Uninstall.cmd')
        if (existsSync(uninstallSrc)) {
            cpSync(uninstallSrc, join(out, 'Uninstall.cmd'))
        }
    }

    const readmeLines = [
        'DataWise CLI (desktop)',
        `Version: ${version}`,
        `Platform: ${target.osKey}-${target.zipArch}`,
        '',
        runHint,
        '',
        'Single JVM: Spring Boot + JetBrains JCEF (jbr_jcef runtime).',
        '',
    ]
    if (target.osKey === 'windows') {
        readmeLines.push(
            'Uninstall (Setup.exe installs only):',
            ' - Settings -> Apps -> DataWiseCLI -> Uninstall',
            ' - or run Uninstall.cmd in this folder',
            ' Portable ZIP: delete this folder (no Windows Installer entry).',
            '',
        )
    }
    writeFileSync(join(out, 'README.txt'), readmeLines.join('\n'), 'utf8')

    validateDesktopLayout(out, target)
    log(`layout -> ${out}`)
    return out
}

/**
 * Run jpackage without shell so args with spaces (e.g. description) are not split on Windows.
 * shell:true concatenates argv and turns "DataWise CLI" into invalid option [CLI].
 */
function resolveJpackageBin() {
    if (process.platform === 'win32') {
        const where = spawnSync('where.exe', ['jpackage'], {
            encoding: 'utf8',
            shell: false,
            windowsHide: true,
        })
        if (where.status === 0 && where.stdout) {
            const line = where.stdout
                .split(/\r?\n/)
                .map((s) => s.trim())
                .find((s) => s.toLowerCase().endsWith('jpackage.exe') || s.toLowerCase().endsWith('jpackage'))
            if (line && existsSync(line)) {
                return line
            }
        }
    } else {
        const which = spawnSync('which', ['jpackage'], {encoding: 'utf8', shell: false})
        if (which.status === 0 && which.stdout) {
            const line = which.stdout.trim().split(/\r?\n/)[0]
            if (line && existsSync(line)) {
                return line
            }
        }
    }
    const javaHome = process.env.JAVA_HOME
    if (javaHome) {
        const candidate = join(javaHome, 'bin', process.platform === 'win32' ? 'jpackage.exe' : 'jpackage')
        if (existsSync(candidate)) {
            return candidate
        }
    }
    return null
}

function runJpackage(args) {
    const bin = resolveJpackageBin()
    if (!bin) {
        return {status: 1, missing: true}
    }
    return spawnSync(bin, args, {
        cwd: desktopRoot,
        stdio: 'inherit',
        shell: false,
        windowsHide: true,
        env: process.env,
    })
}

/**
 * When MAC_SIGNING_IDENTITY is set, codesign CEF Frameworks / helpers (Gatekeeper).
 * No-op on non-mac or when the identity env is unset.
 */
function maybeSignMacFrameworks(frameworksDir) {
    if (process.platform !== 'darwin') {
        return
    }
    const identity = (process.env.MAC_SIGNING_IDENTITY || '').trim()
    if (!identity) {
        log('MAC_SIGNING_IDENTITY unset - skipping Frameworks codesign')
        return
    }
    if (!existsSync(frameworksDir)) {
        return
    }
    log(`codesigning Frameworks with ${identity}...`)
    const find = spawnSync(
        'find',
        [frameworksDir, '(', '-name', '*.dylib', '-o', '-name', '*.framework', '-o', '-name', '*.app', ')'],
        {encoding: 'utf8', shell: false},
    )
    const paths = (find.stdout || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    for (const p of paths) {
        const r = spawnSync(
            'codesign',
            ['--force', '--sign', identity, '--timestamp', '--options', 'runtime', p],
            {stdio: 'inherit', shell: false},
        )
        if (r.status !== 0) {
            log(`codesign warning on ${p} (exit ${r.status})`)
        }
    }
}

/** Sign the outer .app after nested Frameworks (required before notarization). */
function maybeSignMacApp(appPath) {
    if (process.platform !== 'darwin') {
        return
    }
    const identity = (process.env.MAC_SIGNING_IDENTITY || '').trim()
    if (!identity || !appPath || !existsSync(appPath)) {
        return
    }
    log(`codesigning app bundle ${appPath}...`)
    const r = spawnSync(
        'codesign',
        ['--force', '--deep', '--sign', identity, '--timestamp', '--options', 'runtime', appPath],
        {stdio: 'inherit', shell: false},
    )
    if (r.status !== 0) {
        log(`codesign warning on app (exit ${r.status})`)
    }
}

/**
 * Optional notarization when MAC_NOTARIZE=1 (or true) and credentials are present.
 * Prefer NOTARYTOOL_KEYCHAIN_PROFILE; else APPLE_ID + APPLE_TEAM_ID + APPLE_APP_SPECIFIC_PASSWORD.
 * See docs/DESKTOP_PACKAGING.md#macos and scripts/notarize-mac.sh.
 */
function maybeNotarizeMac(appPath) {
    if (process.platform !== 'darwin') {
        return
    }
    const flag = String(process.env.MAC_NOTARIZE || '').trim().toLowerCase()
    if (flag !== '1' && flag !== 'true' && flag !== 'yes') {
        return
    }
    if (!appPath || !existsSync(appPath)) {
        return
    }
    const script = join(desktopRoot, 'scripts', 'notarize-mac.sh')
    if (!existsSync(script)) {
        log('notarize-mac.sh missing - skip notarization')
        return
    }
    log(`notarizing ${appPath}...`)
    const r = spawnSync('bash', [script, appPath], {stdio: 'inherit', shell: false, env: process.env})
    if (r.status !== 0) {
        console.error('[dist:desktop] notarization failed')
        process.exit(r.status ?? 1)
    }
}

/**
 * Produce a native launcher via jpackage when available.
 * Main entry: Spring Boot fat jar (desktop UI on classpath) + jbr_jcef runtime-image.
 * Windows: DataWiseCLI.exe / Linux: DataWiseCLI / macOS: DataWiseCLI.app
 */
function wrapWithJpackage(layoutDir, version, target, jbr) {
    if (!resolveJpackageBin()) {
        log('jpackage not found - keeping java launcher only')
        return
    }
    if (!jbr?.home || !existsSync(join(jbr.home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))) {
        log('jbr_jcef home missing - keeping java launcher only')
        return
    }

    const input = join(desktopRoot, 'target', 'jpackage-input')
    const dest = join(desktopRoot, 'target', 'jpackage-out')
    rmSync(input, {recursive: true, force: true})
    rmSync(dest, {recursive: true, force: true})
    mkdirSync(input, {recursive: true})

    const serverJar = join(layoutDir, 'backend', 'datawise-server.jar')
    cpSync(serverJar, join(input, 'datawise-server.jar'))
    const cdsArchive = join(layoutDir, 'backend', 'datawise.jsa')
    const cdsMeta = join(layoutDir, 'backend', 'datawise.jsa.meta.json')
    const hasCds = existsSync(cdsArchive) && statSync(cdsArchive).size > 100_000
    if (hasCds) {
        cpSync(cdsArchive, join(input, 'datawise.jsa'))
        if (existsSync(cdsMeta)) {
            cpSync(cdsMeta, join(input, 'datawise.jsa.meta.json'))
        }
        log('including AppCDS archive in jpackage input')
    } else {
        log('AppCDS archive missing - jpackage without SharedArchiveFile')
    }

    const iconWin = join(layoutDir, 'icons', 'icon.ico')
    const iconPng = join(layoutDir, 'icons', 'icon.png')
    const args = [
        '--type', 'app-image',
        '--name', 'DataWiseCLI',
        '--app-version', version,
        '--copyright', 'DataWise',
        '--description', 'DataWise CLI',
        '--vendor', 'DataWise',
        '--input', input,
        '--main-jar', 'datawise-server.jar',
        '--main-class', 'org.springframework.boot.loader.launch.JarLauncher',
        '--dest', dest,
        '--runtime-image', jbr.home,
    ]
    for (const opt of SERVER_JVM_OPTS) {
        if (!hasCds && opt.includes('SharedArchiveFile')) {
            continue
        }
        args.push('--java-options', opt)
    }
    args.push('--java-options', `-Ddatawise.github.repo=${resolveRepoIdentity().slug}`)
    if (target.osKey === 'windows' && existsSync(iconWin)) {
        args.push('--icon', iconWin)
    } else if (existsSync(iconPng)) {
        args.push('--icon', iconPng)
    }

    log('running jpackage (jbr_jcef runtime-image)...')
    const result = runJpackage(args)
    if (result.status !== 0) {
        log('jpackage failed - keeping java launcher only')
        return
    }

    const appImage = join(dest, 'DataWiseCLI')
    const macApp = join(dest, 'DataWiseCLI.app')
    let packagedRoot = null
    if (target.osKey === 'macos' && existsSync(macApp)) {
        packagedRoot = macApp
    } else if (existsSync(appImage)) {
        packagedRoot = appImage
    }
    if (!packagedRoot) {
        log('jpackage output missing - keeping java launcher only')
        return
    }

    // Preserve resources next to / inside the native launcher.
    // Windows/Linux app-image root; macOS -> Contents (sibling of app/) so installRoot resolves.
    const resourceParent =
        target.osKey === 'macos' ? join(packagedRoot, 'Contents') : packagedRoot
    mkdirSync(resourceParent, {recursive: true})
    for (const dir of ['frontend-dist', 'backend', 'config-bundle', 'icons']) {
        const src = join(layoutDir, dir)
        if (existsSync(src)) {
            copyTree(src, join(resourceParent, dir))
        }
    }
    writeLocalVersionManifest(layoutDir, version, target)
    writeLocalVersionManifest(resourceParent, version, target)

    // macOS: CEF Frameworks live beside JBR Contents; copy into app Contents if present.
    if (target.osKey === 'macos' && jbr.frameworks && existsSync(jbr.frameworks)) {
        const fwDest = join(resourceParent, 'Frameworks')
        copyTree(jbr.frameworks, fwDest)
        const cefServer = join(fwDest, 'cef_server.app')
        if (existsSync(cefServer)) {
            rmSync(cefServer, {recursive: true, force: true})
        }
        log('copied macOS Frameworks into app Contents')
        maybeSignMacFrameworks(fwDest)
        maybeSignMacApp(packagedRoot)
        maybeNotarizeMac(packagedRoot)
    }

    const runtimeDir = join(resourceParent, 'runtime')
    if (existsSync(runtimeDir)) {
        stripJreBloat(runtimeDir)
    }
    const dupJre = join(resourceParent, 'backend', 'jre')
    if (existsSync(dupJre)) {
        rmSync(dupJre, {recursive: true, force: true})
    }

    for (const name of readdirSync(layoutDir)) {
        rmSync(join(layoutDir, name), {recursive: true, force: true})
    }
    if (target.osKey === 'macos') {
        copyTree(packagedRoot, join(layoutDir, 'DataWiseCLI.app'))
        // Flat resources also at layout root for DATAWISE_INSTALL_ROOT fallbacks.
        for (const dir of ['frontend-dist', 'backend', 'config-bundle', 'icons']) {
            const src = join(resourceParent, dir)
            if (existsSync(src)) {
                copyTree(src, join(layoutDir, dir))
            }
        }
        const lv = join(resourceParent, 'local_version.json')
        if (existsSync(lv)) {
            cpSync(lv, join(layoutDir, 'local_version.json'))
        }
    } else {
        for (const name of readdirSync(packagedRoot)) {
            copyTree(join(packagedRoot, name), join(layoutDir, name))
        }
    }
    log(`jpackage ready (${target.osKey})`)
    validateDesktopLayout(layoutDir, target, {jpackageRoot: packagedRoot})
}

/**
 * Stable upgrade id so newer Setup.exe can replace older installs (Windows).
 * Do not change casually - regenerating breaks in-place upgrades.
 *
 * Same-version reinstall (e.g. rebuild 4.1.4 over 4.1.4) needs custom WiX
 * {@code jpackage-resources/windows/main.wxs} (IncludeMaximum=yes). Without it,
 * the jpackage EXE wrapper flashes an error and appears to hang.
 */
const WINDOWS_UPGRADE_UUID = '7f3e9c2a-4b1d-4e8f-9a6c-2d5e8f1b3c4d'

function findWixBinDirs() {
    const dirs = []
    const roots = [
        process.env['WIX'],
        process.env['WIX_HOME'],
        'C:\\Program Files (x86)\\WiX Toolset v3.14\\bin',
        'C:\\Program Files (x86)\\WiX Toolset v3.11\\bin',
        'C:\\Program Files\\WiX Toolset v3.14\\bin',
    ].filter(Boolean)
    for (const root of roots) {
        if (existsSync(join(root, 'candle.exe')) || existsSync(join(root, 'candle'))) {
            dirs.push(root)
        } else if (existsSync(join(root, 'bin', 'candle.exe'))) {
            dirs.push(join(root, 'bin'))
        }
    }
    return dirs
}

function ensureWixOnPath() {
    const which = spawnSync('where.exe', ['candle'], {encoding: 'utf8', shell: true})
    if (which.status === 0) {
        return true
    }
    const bins = findWixBinDirs()
    if (bins.length === 0) {
        return false
    }
    process.env.PATH = `${bins.join(';')};${process.env.PATH || ''}`
    const again = spawnSync('where.exe', ['candle'], {encoding: 'utf8', shell: true})
    return again.status === 0
}

function hasCommand(cmd) {
    const which = process.platform === 'win32' ? 'where.exe' : 'which'
    const result = spawnSync(which, [cmd], {encoding: 'utf8', shell: true})
    return result.status === 0
}

/**
 * Windows installer (Inno Setup).
 * @returns {Promise<string|null>}
 */
async function buildWindowsInnoInstaller(version, layoutDir, dest, profile = 'core') {
    if (!existsSync(join(layoutDir, 'DataWiseCLI.exe'))) {
        log('Setup.exe skipped - DataWiseCLI.exe missing (jpackage app-image failed)')
        return null
    }
    let iscc
    try {
        iscc = await ensureInnoSetup(join(desktopRoot, 'target', 'inno-setup'))
    } catch (e) {
        log(`Inno Setup: ${e instanceof Error ? e.message : String(e)}`)
        return null
    }

    const iss = join(desktopRoot, 'installer', 'windows', 'DataWiseCLI.iss')
    const icon = existsSync(join(layoutDir, 'icons', 'icon.ico'))
        ? join(layoutDir, 'icons', 'icon.ico')
        : join(frontendRoot, 'build', 'icon.ico')
    const wizardImage = join(frontendRoot, 'build', 'installer-sidebar.bmp')
    const wizardSmall = join(frontendRoot, 'build', 'installer-header.bmp')
    const outBase = `DataWiseCLI-${version}${profileArtifactToken(profile)}-windows-x64-setup`
    const releaseOut = join(frontendRoot, 'release')

    const defs = [
        `/DMyAppVersion=${version}`,
        `/DMyAppSource=${layoutDir}`,
        `/DMyOutputDir=${dest}`,
        `/DMyOutputBase=${outBase}`,
        `/DMySetupIcon=${icon}`,
    ]
    if (existsSync(wizardImage)) {
        defs.push(`/DMyWizardImage=${wizardImage}`)
    }
    if (existsSync(wizardSmall)) {
        defs.push(`/DMyWizardSmallImage=${wizardSmall}`)
    }

    // ISCC resolves relative MessagesFile (ChineseSimplified.isl) against the .iss directory
    const result = spawnSync(iscc, [...defs, iss], {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        cwd: join(desktopRoot, 'installer', 'windows'),
    })
    if (result.stdout) {
        process.stdout.write(result.stdout)
    }
    if (result.stderr) {
        process.stderr.write(result.stderr)
    }
    if (result.status !== 0) {
        log(`Inno Setup failed (exit ${result.status})`)
        return null
    }

    const built = join(dest, `${outBase}.exe`)
    if (!existsSync(built)) {
        log(`Inno output missing: ${built}`)
        return null
    }
    mkdirSync(releaseOut, {recursive: true})
    const outPath = join(releaseOut, `${outBase}.exe`)
    stopDesktopProcesses()
    await copyFileRobust(built, outPath, {
        tag: 'dist:desktop',
        onRetry: stopDesktopProcesses,
    })
    log(`release installer (Inno) -> ${outPath}`)
    return outPath
}

/**
 * Native installer from the assembled app-image:
 * Windows -> Inno Setup / macOS -> DMG / Linux -> deb
 * @returns {string|null} path to installer in release/
 */
async function buildNativeInstaller(version, layoutDir, target, installerKind = 'auto', profile = 'core') {
    const dest = join(desktopRoot, 'target', 'jpackage-installer')
    rmSync(dest, {recursive: true, force: true})
    mkdirSync(dest, {recursive: true})

    /** @type {{type: string, releaseSuffix: string, extensions: string[], args: string[]}|null} */
    let spec = null

    if (target.osKey === 'windows') {
        const wantInno = installerKind === 'auto' || installerKind === 'inno'
        const wantWix = installerKind === 'wix'

        if (wantInno) {
            const innoOut = await buildWindowsInnoInstaller(version, layoutDir, dest, profile)
            if (innoOut) {
                return innoOut
            }
            return null
        }

        if (!wantWix) {
            return null
        }
        if (!existsSync(join(layoutDir, 'DataWiseCLI.exe'))) {
            log('Setup.exe skipped - DataWiseCLI.exe missing (jpackage app-image failed)')
            return null
        }
        if (!ensureWixOnPath()) {
            log('Setup.exe skipped - WiX Toolset 3.x not found (candle.exe).')
            log(' Install: winget install --id WiXToolset.WiXToolset -e')
            log(' Or: choco install wixtoolset -y')
            log(' Then re-run: npm run dist:desktop')
            return null
        }
        const icon = join(layoutDir, 'icons', 'icon.ico')
        // Custom WiX: same-version reinstall + zh-CN UI + license (jpackage-resources/windows).
        const winResources = join(desktopRoot, 'jpackage-resources', 'windows')
        const license = join(winResources, 'LICENSE.rtf')
        const args = [
            '--type', 'exe',
            '--app-image', layoutDir,
            '--name', 'DataWiseCLI',
            '--app-version', version,
            '--copyright', 'DataWise',
            '--description', 'DataWise CLI - SQL workbench for data teams',
            '--vendor', 'DataWise',
            '--dest', dest,
            '--about-url', githubHttps()?.repo || 'https://github.com/gouyehappy/datawise-cli',
            '--win-help-url', githubHttps()?.repo || 'https://github.com/gouyehappy/datawise-cli',
            '--win-menu',
            '--win-menu-group', 'DataWise',
            '--win-shortcut',
            '--win-shortcut-prompt',
            '--win-dir-chooser',
            '--win-upgrade-uuid', WINDOWS_UPGRADE_UUID,
        ]
        if (existsSync(join(winResources, 'main.wxs'))) {
            args.push('--resource-dir', winResources)
        }
        if (existsSync(license)) {
            args.push('--license-file', license)
        }
        if (existsSync(icon)) {
            args.push('--icon', icon)
        }
        spec = {
            type: 'exe',
            releaseSuffix: `-setup.exe`,
            extensions: ['.exe'],
            args,
        }
    } else if (target.osKey === 'macos') {
        if (!existsSync(join(layoutDir, 'DataWiseCLI.app'))) {
            log('DMG skipped - DataWiseCLI.app missing (jpackage app-image failed)')
            return null
        }
        // jpackage --type dmg expects the .app as --app-image root
        const appImage = join(layoutDir, 'DataWiseCLI.app')
        const icon = join(layoutDir, 'icons', 'icon.png')
        const args = [
            '--type', 'dmg',
            '--app-image', appImage,
            '--name', 'DataWiseCLI',
            '--app-version', version,
            '--copyright', 'DataWise',
            '--description', 'DataWise CLI',
            '--vendor', 'DataWise',
            '--dest', dest,
        ]
        if (existsSync(icon)) {
            args.push('--icon', icon)
        }
        spec = {
            type: 'dmg',
            releaseSuffix: '.dmg',
            extensions: ['.dmg'],
            args,
        }
    } else if (target.osKey === 'linux') {
        if (!existsSync(join(layoutDir, 'DataWiseCLI')) && !existsSync(join(layoutDir, 'bin'))) {
            log('deb skipped - native launcher missing (jpackage app-image failed)')
            return null
        }
        if (!hasCommand('fakeroot')) {
            log('deb skipped - fakeroot not found.')
            log(' Install: sudo apt-get install -y fakeroot binutils')
            log(' Then re-run: npm run dist:desktop')
            return null
        }
        const icon = join(layoutDir, 'icons', 'icon.png')
        const args = [
            '--type', 'deb',
            '--app-image', layoutDir,
            '--name', 'DataWiseCLI',
            '--app-version', version,
            '--copyright', 'DataWise',
            '--description', 'DataWise CLI',
            '--vendor', 'DataWise',
            '--dest', dest,
            '--linux-package-name', 'datawise-cli',
        ]
        if (existsSync(icon)) {
            args.push('--icon', icon)
        }
        spec = {
            type: 'deb',
            releaseSuffix: '.deb',
            extensions: ['.deb'],
            args,
        }
    } else {
        return null
    }

    log(`running jpackage --type ${spec.type} (native installer)...`)
    const result = runJpackage(spec.args)
    if (result.missing) {
        log(`jpackage not found - skip ${spec.type} installer`)
        return null
    }
    if (result.status !== 0) {
        log(`jpackage --type ${spec.type} failed - zip/portable still available`)
        return null
    }

    const releaseDir = join(frontendRoot, 'release')
    mkdirSync(releaseDir, {recursive: true})
    const outName = `DataWiseCLI-${version}${profileArtifactToken(profile)}-${target.osKey}-${target.zipArch}${spec.releaseSuffix}`
    const outPath = join(releaseDir, outName)

    const candidates = [
        join(dest, `DataWiseCLI-${version}${spec.extensions[0]}`),
        join(dest, `DataWiseCLI${spec.extensions[0]}`),
        join(dest, `datawise-cli_${version}_amd64.deb`),
        join(dest, `datawise-cli_${version}_arm64.deb`),
    ]
    let produced = candidates.find((p) => existsSync(p))
    if (!produced && existsSync(dest)) {
        const found = readdirSync(dest).filter((n) =>
            spec.extensions.some((ext) => n.toLowerCase().endsWith(ext)),
        )
        if (found.length === 1) {
            produced = join(dest, found[0])
        } else if (found.length > 1) {
            // Prefer versioned name when jpackage emits multiple files
            produced = join(dest, found.find((n) => n.includes(version)) || found[0])
        }
    }
    if (!produced) {
        log(`installer output not found in jpackage-installer/ (type=${spec.type})`)
        return null
    }

    stopDesktopProcesses()
    await copyFileRobust(produced, outPath, {
        tag: 'dist:desktop',
        onRetry: stopDesktopProcesses,
    })
    log(`release installer -> ${outPath}`)
    return outPath
}

function zipRelease(version, layoutDir, target, profile = 'core') {
    const releaseDir = join(frontendRoot, 'release')
    mkdirSync(releaseDir, {recursive: true})
    const zipName = `DataWiseCLI-${version}${profileArtifactToken(profile)}-${target.osKey}-${target.zipArch}.zip`
    const zipPath = join(releaseDir, zipName)
    if (existsSync(zipPath)) {
        rmSync(zipPath, {force: true})
    }

    // macOS: package only the .app via ditto (preserves Frameworks symlinks; avoids
    // Node/zip OOM on duplicated flat+app layout that previously crashed CI).
    if (target.osKey === 'macos') {
        const appName = 'DataWiseCLI.app'
        const appPath = join(layoutDir, appName)
        if (!existsSync(appPath)) {
            console.error(`[dist:desktop] missing ${appPath} - cannot zip macOS release`)
            process.exit(1)
        }
        run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appName, zipPath], layoutDir)
        log(`release zip -> ${zipPath}`)
        return zipPath
    }

    stopDesktopProcesses()
    zipDirectoryContents(layoutDir, zipPath, {tag: 'dist:desktop'})
    log(`release zip -> ${zipPath}`)
    return zipPath
}

/** SPA-only patch zip for incremental updates (preferred by DesktopUpdaterService). */
function zipFrontendDistRelease(version, layoutDir) {
    const fe = join(layoutDir, 'frontend-dist')
    if (!existsSync(join(fe, 'index.html'))) {
        log('frontend-dist zip skipped - index.html missing')
        return null
    }
    const releaseDir = join(frontendRoot, 'release')
    mkdirSync(releaseDir, {recursive: true})
    const zipName = `DataWiseCLI-${version}-frontend-dist.zip`
    const zipPath = join(releaseDir, zipName)
    const staging = join(desktopRoot, 'target', 'frontend-dist-zip')
    rmSync(staging, {recursive: true, force: true})
    mkdirSync(staging, {recursive: true})
    cpSync(fe, join(staging, 'frontend-dist'), {recursive: true})
    const lv = join(layoutDir, 'local_version.json')
    if (existsSync(lv)) {
        cpSync(lv, join(staging, 'local_version.json'))
    }

    zipDirectoryContents(staging, zipPath, {tag: 'dist:desktop'})
    log(`release frontend-dist zip -> ${zipPath}`)
    return zipPath
}

/** Backend jar patch for jar-level incremental updates (requires app relaunch). */
function zipServerJarRelease(version, layoutDir) {
    const jar = join(layoutDir, 'backend', 'datawise-server.jar')
    if (!existsSync(jar)) {
        log('server-jar zip skipped - datawise-server.jar missing')
        return null
    }
    const releaseDir = join(frontendRoot, 'release')
    mkdirSync(releaseDir, {recursive: true})
    const zipName = `DataWiseCLI-${version}-server-jar.zip`
    const zipPath = join(releaseDir, zipName)
    const staging = join(desktopRoot, 'target', 'server-jar-zip')
    rmSync(staging, {recursive: true, force: true})
    mkdirSync(join(staging, 'backend'), {recursive: true})
    cpSync(jar, join(staging, 'backend', 'datawise-server.jar'))
    const lv = join(layoutDir, 'local_version.json')
    if (existsSync(lv)) {
        cpSync(lv, join(staging, 'local_version.json'))
    }

    zipDirectoryContents(staging, zipPath, {tag: 'dist:desktop'})
    log(`release server-jar zip -> ${zipPath}`)
    return zipPath
}

function writeReleaseVersionJson(version, target, artifacts) {
    const releaseDir = join(frontendRoot, 'release')
    mkdirSync(releaseDir, {recursive: true})
    const manifest = {
        schema: 1,
        version: String(version),
        platform: `${target.osKey}-${target.zipArch}`,
        builtAt: new Date().toISOString(),
        // D-04: clients prefer frontend-dist / server-jar over full installer when present.
        preferIncremental: true,
        artifacts: Object.fromEntries(
            Object.entries(artifacts).filter(([, v]) => Boolean(v)),
        ),
    }
    const platformPath = join(releaseDir, `version-${target.osKey}-${target.zipArch}.json`)
    const latestPath = join(releaseDir, 'version.json')
    const body = `${JSON.stringify(manifest, null, 2)}\n`
    writeFileSync(platformPath, body, 'utf8')
    writeFileSync(latestPath, body, 'utf8')
    log(`release version.json -> ${platformPath}`)
    return {platformPath, latestPath}
}

function curlJson(args) {
    const curl = curlBin()
    const result = spawnSync(curl, args, {
        encoding: 'utf8',
        // Avoid cmd.exe mangling paths / @file args on Windows.
        shell: false,
        windowsHide: true,
    })
    return result
}

async function publishRelease(version, assetPaths) {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
    if (!token) {
        console.error('[dist:desktop] --publish requires GH_TOKEN or GITHUB_TOKEN')
        process.exit(1)
    }
    const identity = resolveRepoIdentity({required: true})
    const tag = version.startsWith('v') ? version : `v${version}`
    const paths = (Array.isArray(assetPaths) ? assetPaths : [assetPaths]).filter(Boolean)
    if (paths.length === 0) {
        console.error('[dist:desktop] nothing to publish')
        process.exit(1)
    }

    const createUrl = `https://api.github.com/repos/${identity.slug}/releases`
    const createBody = JSON.stringify({
        tag_name: tag,
        name: `DataWise ${tag}`,
        draft: false,
        prerelease: false,
        generate_release_notes: true,
    })
    const auth = [`-H`, `Authorization: Bearer ${token}`, `-H`, 'Accept: application/vnd.github+json']

    let release = null
    const list = curlJson([
        '--fail', '--silent', '--show-error', '--http1.1',
        ...auth,
        `${createUrl}/tags/${tag}`,
    ])
    if (list.status === 0 && list.stdout) {
        try {
            release = JSON.parse(list.stdout)
        } catch {
            // create below
        }
    }
    if (!release?.id) {
        const created = curlJson([
            '--fail', '--silent', '--show-error', '--http1.1',
            '-X', 'POST',
            ...auth,
            '-H', 'Content-Type: application/json',
            '-d', createBody,
            createUrl,
        ])
        if (created.status !== 0) {
            console.error(
                '[dist:desktop] failed to create release:',
                (created.stderr || created.stdout || '').trim() || `curl exit ${created.status}`,
            )
            process.exit(1)
        }
        release = JSON.parse(created.stdout)
    }

    const existingByName = new Map(
        (release.assets ?? []).map((asset) => [asset.name, asset.id]),
    )
    // Refresh asset list once more - parallel OS jobs race to create/upload.
    const refreshed = curlJson([
        '--fail', '--silent', '--show-error', '--http1.1',
        ...auth,
        `${createUrl}/${release.id}`,
    ])
    if (refreshed.status === 0 && refreshed.stdout) {
        try {
            const body = JSON.parse(refreshed.stdout)
            for (const asset of body.assets ?? []) {
                existingByName.set(asset.name, asset.id)
            }
            release.id = body.id ?? release.id
        } catch {
            // keep existing map
        }
    }

    const versionPlain = tag.replace(/^v/, '')
    const sharedAssetNames = new Set([
        `DataWiseCLI-${versionPlain}-frontend-dist.zip`,
        `DataWiseCLI-${versionPlain}-server-jar.zip`,
        'version.json',
    ])

    for (const assetPath of paths) {
        const assetName = basename(assetPath)
        if (!existsSync(assetPath)) {
            console.error(`[dist:desktop] missing asset file: ${assetPath}`)
            process.exit(1)
        }
        const priorId = existingByName.get(assetName)
        if (priorId) {
            if (sharedAssetNames.has(assetName)) {
                // Shared across OS jobs - first successful upload wins.
                log(`skip existing shared asset ${assetName}`)
                continue
            }
            log(`replacing existing asset ${assetName}...`)
            const deleted = curlJson([
                '--fail', '--silent', '--show-error', '--http1.1',
                '-X', 'DELETE',
                ...auth,
                `https://api.github.com/repos/${identity.slug}/releases/assets/${priorId}`,
            ])
            if (deleted.status !== 0) {
                const detail = (deleted.stderr || deleted.stdout || '').trim()
                console.error(
                    '[dist:desktop] failed to delete existing asset:',
                    detail || `curl exit ${deleted.status}`,
                )
                process.exit(1)
            }
            existingByName.delete(assetName)
        }
        const size = statSync(assetPath).size
        log(`uploading ${assetName} (${size} bytes) to GitHub release ${tag}...`)
        const lower = assetName.toLowerCase()
        const contentType =
            lower.endsWith('.zip')
                ? 'application/zip'
                : lower.endsWith('.json')
                  ? 'application/json'
                  : 'application/octet-stream' // .exe / .dmg / .deb
        const uploadUrl =
            `https://uploads.github.com/repos/${identity.slug}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`
        // Use -T (stream upload) instead of --data-binary @file: the latter loads
        // the whole file into RAM and OOMs on ~300MB+ Windows/macOS zips in CI.
        const uploaded = curlJson([
            '--fail', '--show-error', '--http1.1',
            '--max-time', '7200',
            '--retry', '3', '--retry-all-errors', '--retry-delay', '5',
            '-X', 'POST',
            ...auth,
            '-H', `Content-Type: ${contentType}`,
            '-T', assetPath,
            uploadUrl,
        ])
        if (uploaded.status !== 0) {
            const detail = (uploaded.stderr || uploaded.stdout || '').trim()
            // Parallel jobs may race on shared names (frontend-dist / server-jar).
            if (/already_exists|Validation Failed/i.test(detail)) {
                log(`skip raced asset ${assetName}`)
                continue
            }
            console.error(
                '[dist:desktop] upload failed:',
                detail || `curl exit ${uploaded.status ?? 'unknown'}`,
            )
            process.exit(1)
        }
        try {
            const body = JSON.parse(uploaded.stdout || '{}')
            if (body.id) {
                existingByName.set(assetName, body.id)
            }
        } catch {
            existingByName.set(assetName, -1)
        }
        log(`uploaded ${assetName}`)
    }
    log('published to GitHub Releases')
}

function writeSizeReport(layoutDir, profile) {
    const script = join(frontendRoot, 'scripts', 'desktop', 'size-report.mjs')
    const out = join(frontendRoot, 'release', `size-report-${profile}.json`)
    mkdirSync(dirname(out), {recursive: true})
    const result = spawnSync(
        process.execPath,
        [script, '--dir', layoutDir, '--profile', profile, '--out', out],
        {encoding: 'utf8', shell: false, windowsHide: true, cwd: frontendRoot, stdio: 'inherit'},
    )
    if (result.status !== 0) {
        log(`size-report failed (exit ${result.status}) - continuing`)
        return null
    }
    return out
}

/** R-3: fail the pack if size-report / layout smoke checks fail. */
function runReleaseSmoke(sizeReportPath, layoutDir, zipPath) {
    if (!sizeReportPath) {
        log('release-smoke skipped - no size-report')
        return
    }
    const script = join(frontendRoot, 'scripts', 'desktop', 'release-smoke.mjs')
    const args = [script, '--report', sizeReportPath, '--layout', layoutDir]
    if (zipPath) {
        args.push('--zip', zipPath)
    }
    const result = spawnSync(process.execPath, args, {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        cwd: frontendRoot,
        stdio: 'inherit',
    })
    if (result.status !== 0) {
        throw new Error(`release-smoke failed (exit ${result.status}) - see _private/docs/design/DESKTOP_RELEASE_CHECKLIST.md`)
    }
}

async function main() {
    const target = resolveTarget()
    const opts = parseArgs(process.argv.slice(2))
    const version = readVersion()
    log(`target=${target.osKey}-${target.zipArch} profile=${opts.profile} (same-JVM + jbr_jcef)`)

    run('npm', ['run', 'gen:icons'], frontendRoot)

    if (!opts.skipBackend) {
        await bundleBackend(opts.profile)
    }
    buildFrontend()

    const jbrCache = join(desktopRoot, 'target', 'jbr-cache')
    log('ensuring jbr_jcef runtime...')
    const jbr = await ensureJbrJcef(jbrCache)

    const layout = await assembleLayout(version, target, jbr)
    const sizeReport = writeSizeReport(layout, opts.profile)
    runReleaseSmoke(sizeReport, layout, null)

    if (!opts.dir) {
        const zip = zipRelease(version, layout, target, opts.profile)
        runReleaseSmoke(sizeReport, layout, zip)
        const frontendZip = zipFrontendDistRelease(version, layout)
        const serverZip = zipServerJarRelease(version, layout)
        // Publish portable/patch assets before heavy native installer (esp. macOS DMG),
        // so an OOM/crash in jpackage --type dmg does not lose the zip upload.
        let versionFiles = writeReleaseVersionJson(version, target, {
            portableZip: zip ? basename(zip) : null,
            frontendDist: frontendZip ? basename(frontendZip) : null,
            serverJar: serverZip ? basename(serverZip) : null,
            installer: null,
            profile: opts.profile,
        })
        if (opts.publish) {
            await publishRelease(version, [
                zip,
                frontendZip,
                serverZip,
                sizeReport,
                versionFiles.platformPath,
                versionFiles.latestPath,
            ])
        }

        const skipDmg = target.osKey === 'macos'
            && ['1', 'true', 'yes'].includes(String(process.env.MAC_SKIP_DMG || '').trim().toLowerCase())
        const installer = opts.installer && !skipDmg
            ? await buildNativeInstaller(version, layout, target, opts.installerKind, opts.profile)
            : null
        if (skipDmg) {
            log('MAC_SKIP_DMG set - skipping DMG installer')
        }
        if (installer) {
            versionFiles = writeReleaseVersionJson(version, target, {
                portableZip: zip ? basename(zip) : null,
                frontendDist: frontendZip ? basename(frontendZip) : null,
                serverJar: serverZip ? basename(serverZip) : null,
                installer: basename(installer),
                profile: opts.profile,
            })
            if (opts.publish) {
                await publishRelease(version, [
                    installer,
                    versionFiles.platformPath,
                    versionFiles.latestPath,
                ])
            }
        }
    } else if (opts.installer) {
        // Unpacked layout still useful for local installer smoke builds.
        await buildNativeInstaller(version, layout, target, opts.installerKind, opts.profile)
    }

    log('done')
}

await main()
