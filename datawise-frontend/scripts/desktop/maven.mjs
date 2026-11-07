/**
 * Maven helpers for desktop / backend packaging.
 *
 * Goals:
 * - Always skip tests
 * - Build into the standard Maven `target/` (same as `npm run dev` / IDE)
 * - Prefer filesystem purge over maven-clean (less EPERM on Windows)
 * - Validate the Spring Boot server JAR before continuing
 */
import {execSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {basename, dirname, join} from 'node:path'
import {
    backendRoot,
    backendModulesForProfile,
    DEFAULT_DESKTOP_PROFILE,
    serverTargetDir,
} from './paths.mjs'
import {
    isDirectRun,
    log,
    removePathRobust,
    resolveServerJar,
    run,
    sleep,
    stopDesktopProcesses,
} from './lib.mjs'
import {ensureJetbrainsJcefMavenArtifact} from './ensure-jcef-maven.mjs'

/** Skip compiling and running tests for every desktop Maven invocation. */
export const MAVEN_SKIP_TEST_ARGS = [
    '-Dmaven.test.skip=true',
    '-DskipTests',
]

/** Stability flags for Windows packaging builds. */
export const MAVEN_STABLE_ARGS = [
    // Disable incremental javac — partial class dirs cause "class file for X not found".
    '-Dmaven.compiler.useIncrementalCompilation=false',
    // Single-threaded reactor: fewer half-written outputs.
    '-T',
    '1',
]

const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', '.idea', '.vscode', 'release', 'dist'])

/**
 * Collect Maven build-output directories under datawise-backend.
 * @param {string} [root]
 * @param {string[]} [names] directory basenames to collect
 */
export function collectBackendTargetDirs(
    root = backendRoot,
    names = ['target'],
) {
    const wanted = new Set(names)
    const results = []
    const walk = (dir, depth) => {
        if (depth > 8) return
        let entries
        try {
            entries = readdirSync(dir, {withFileTypes: true})
        } catch {
            return
        }
        for (const ent of entries) {
            if (!ent.isDirectory()) continue
            if (SKIP_DIR_NAMES.has(ent.name)) continue
            const full = join(dir, ent.name)
            if (wanted.has(ent.name)) {
                results.push(full)
                continue
            }
            walk(full, depth + 1)
        }
    }
    walk(root, 0)
    return results
}

function killPid(pid) {
    try {
        execSync(`taskkill /F /PID ${pid} /T`, {stdio: 'ignore', windowsHide: true})
        return true
    } catch {
        return false
    }
}

/**
 * Opt-in stop of Cursor/VS Code Java language servers (file locks on Windows).
 * Set DATAWISE_KILL_JAVA_LS=1 only if purge/build still hits locked `target/` files.
 */
export function stopJavaIdeBuilders() {
    if (process.platform !== 'win32') {
        return
    }
    if (process.env.DATAWISE_KILL_JAVA_LS !== '1') {
        return
    }

    const patterns = ['jdt.ls', 'jdt_ws', 'redhat.java', 'org.eclipse.equinox.launcher']
    const pids = new Set()

    try {
        // Use -EncodedCommand so nested quotes in -Filter are not eaten by cmd/PowerShell.
        const ps = [
            "Get-CimInstance Win32_Process -Filter \"Name = 'java.exe'\"",
            '| Where-Object {',
            patterns.map((p) => `$_.CommandLine -like '*${p}*'`).join(' -or '),
            '} | Select-Object -ExpandProperty ProcessId',
        ].join(' ')
        const encoded = Buffer.from(ps, 'utf16le').toString('base64')
        const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
            encoding: 'utf8',
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        for (const line of raw.split(/\r?\n/)) {
            const pid = line.trim()
            if (/^\d+$/.test(pid)) pids.add(pid)
        }
    } catch {
        // fall through to wmic
    }

    if (pids.size === 0) {
        for (const pattern of patterns) {
            try {
                const raw = execSync(
                    `wmic process where "CommandLine like '%${pattern}%'" get ProcessId`,
                    {encoding: 'utf8', windowsHide: true},
                )
                for (const line of raw.split(/\r?\n/)) {
                    const pid = line.trim()
                    if (/^\d+$/.test(pid)) pids.add(pid)
                }
            } catch {
                // no matches / wmic unavailable
            }
        }
    }

    let killed = 0
    for (const pid of pids) {
        if (killPid(pid)) killed += 1
    }
    if (killed > 0) {
        log('maven', `stopped ${killed} Java IDE builder process(es) (DATAWISE_KILL_JAVA_LS=1)`)
    }
}

/**
 * Free locks, then delete Maven `target/` dirs.
 * This is the only place in the packaging pipeline that stops desktop processes by default.
 */
export async function purgeBackendTargets() {
    stopDesktopProcesses()
    stopJavaIdeBuilders()
    await sleep(400)

    const names = ['target']
    const targets = collectBackendTargetDirs(backendRoot, names)
    log(
        'maven',
        `purging ${targets.length} target/ directories under datawise-backend…`,
    )
    for (const target of targets) {
        await removePathRobust(target, {
            tag: 'maven',
            onRetry: () => {
                stopDesktopProcesses()
                stopJavaIdeBuilders()
            },
        })
    }
}

/**
 * @param {object} options
 * @param {string} [options.cwd]
 * @param {string[]} options.goals
 * @param {string|string[]|null} [options.modules] - Maven -pl list; null = whole reactor
 * @param {boolean} [options.alsoMake] - pass -am with -pl
 * @param {string[]} [options.extraArgs]
 */
export function runMaven({
    cwd = backendRoot,
    goals,
    modules = null,
    alsoMake = true,
    extraArgs = [],
} = {}) {
    if (!Array.isArray(goals) || goals.length === 0) {
        throw new Error('runMaven requires goals')
    }

    const args = [...goals]
    if (modules != null) {
        const list = Array.isArray(modules) ? modules.filter(Boolean).join(',') : String(modules)
        if (list) {
            args.push('-pl', list)
            if (alsoMake) args.push('-am')
        }
    }

    args.push(
        ...MAVEN_SKIP_TEST_ARGS,
        ...MAVEN_STABLE_ARGS,
        // Slim fat JAR: property skips ops-extras (Swagger UI / Prometheus) and activates desktop profile.
        '-Ddatawise.desktop.packaging=true',
        // Belt-and-suspenders for Maven versions that ignore !property activation.
        '-P!ops-extras',
        ...extraArgs,
    )

    // Never force Aliyun settings.xml here: mirrorOf=* breaks GitHub Actions
    // (502) and can rewrite JetBrains repos. Local China builds may pass
    // `-s .mvn/settings.xml` explicitly (see .mvn/readme.md).

    log('maven', `mvn ${args.join(' ')}`)
    run('mvn', args, cwd)
}

function assertSqlFlowStatementClass() {
    const statementClass = join(
        backendRoot,
        'datawise-sqlflow',
        'target',
        'classes/org/apache/datawise/sqlflow/tree/statement/Statement.class',
    )
    if (!existsSync(statementClass)) {
        throw new Error(
            `Missing ${statementClass} after Maven build. ` +
                'Re-run: npm run build:backend',
        )
    }
    log('maven', 'validated sqlflow Statement.class')
}

/**
 * Eclipse/JDT sometimes writes stub .class files into target/classes that throw
 * `Error("Unresolved compilation problems…")` with default-package descriptors.
 * Packaging those stubs yields ClassNotFoundException: ConnectorPluginLoader (no package).
 */
const ECLIPSE_STUB_MARKER = Buffer.from('Unresolved compilation problems')

function classFileLooksLikeEclipseStub(classPath) {
    try {
        const bytes = readFileSync(classPath)
        return bytes.includes(ECLIPSE_STUB_MARKER)
    } catch {
        return false
    }
}

function collectEclipseCompilationStubs() {
    const roots = collectBackendTargetDirs(backendRoot, ['classes']).filter((dir) =>
        dir.replace(/\\/g, '/').includes('/target/classes'),
    )
    const stubs = []
    const walk = (dir, depth) => {
        if (depth > 24 || stubs.length >= 20) return
        let entries
        try {
            entries = readdirSync(dir, {withFileTypes: true})
        } catch {
            return
        }
        for (const ent of entries) {
            const full = join(dir, ent.name)
            if (ent.isDirectory()) {
                walk(full, depth + 1)
                continue
            }
            if (ent.isFile() && ent.name.endsWith('.class') && classFileLooksLikeEclipseStub(full)) {
                stubs.push(full)
            }
        }
    }
    for (const root of roots) walk(root, 0)
    return stubs
}

/** Module directory that owns `.../target/classes/**`. */
function moduleRootFromClassFile(classPath) {
    let dir = dirname(classPath)
    while (basename(dir) !== 'classes') {
        const parent = dirname(dir)
        if (parent === dir) return null
        dir = parent
    }
    const targetDir = dirname(dir)
    if (basename(targetDir) !== 'target') return null
    return dirname(targetDir)
}

/**
 * Maven packages from the classes it just compiled. The Java language server
 * often rewrites `target/classes` afterwards with ECJ stubs. Those files abort
 * packaging even when the module JAR (what the fat JAR actually embeds) is clean.
 */
function moduleJarContainsEclipseStub(classPath) {
    const moduleRoot = moduleRootFromClassFile(classPath)
    if (!moduleRoot) return true
    const classesDir = join(moduleRoot, 'target', 'classes')
    const rel = classPath.slice(classesDir.length + 1).replace(/\\/g, '/')
    let jars
    try {
        jars = readdirSync(join(moduleRoot, 'target')).filter(
            (name) =>
                name.endsWith('.jar')
                && !name.includes('-sources')
                && !name.includes('-javadoc')
                && !name.includes('-tests')
                && !name.endsWith('.jar.original'),
        )
    } catch {
        return true
    }
    if (!jars.length) return true
    const moduleName = basename(moduleRoot)
    const preferred = jars.find((name) => name.startsWith(`${moduleName}-`)) ?? jars[0]
    const jarPath = join(moduleRoot, 'target', preferred)
    const work = mkdtempSync(join(tmpdir(), 'dw-eclipse-modjar-'))
    const pull = (entry) => {
        execSync(`jar xf "${jarPath}" "${entry}"`, {
            cwd: work,
            windowsHide: true,
            stdio: 'ignore',
        })
        const extracted = join(work, ...entry.split('/'))
        return existsSync(extracted) ? extracted : null
    }
    try {
        const extracted = pull(rel) ?? pull(`BOOT-INF/classes/${rel}`)
        if (!extracted) return true
        return classFileLooksLikeEclipseStub(extracted)
    } catch {
        return true
    } finally {
        rmSync(work, {recursive: true, force: true})
    }
}

function assertNoEclipseCompilationStubs() {
    const stubs = collectEclipseCompilationStubs()
    if (!stubs.length) {
        log('maven', 'validated no Eclipse unresolved-compilation stubs in target/classes')
        return
    }
    const packaged = stubs.filter((classPath) => moduleJarContainsEclipseStub(classPath))
    if (!packaged.length) {
        log(
            'maven',
            `target/classes has ${stubs.length} Eclipse stub(s) written after the module JAR; packaged classes are clean`,
        )
        return
    }
    const shown = packaged.slice(0, 8).join('\n  ')
    throw new Error(
        `Eclipse/JDT stub class(es) detected under target/classes (packaging aborted):\n  ${shown}` +
            (packaged.length > 8 ? `\n  …and ${packaged.length - 8} more` : '') +
            '\nClose Java language server interference or re-run with DATAWISE_KILL_JAVA_LS=1, then: npm run build:backend',
    )
}

/**
 * Canary: nested module jars that previously shipped Eclipse stubs.
 * Full tree walk of every datawise-* nested jar is too slow for every package.
 */
const FAT_JAR_STUB_CANARY_PREFIXES = [
    'datawise-database-',
    'datawise-ai-',
    'datawise-sync-',
    'datawise-backup-',
    'datawise-datagen-',
]

/**
 * Scan nested canary `datawise-*.jar` inside the Spring Boot fat jar for Eclipse stubs.
 */
function assertFatJarHasNoEclipseCompilationStubs(serverJar) {
    const work = mkdtempSync(join(tmpdir(), 'dw-eclipse-stub-'))
    try {
        const listing = execSync(`jar tf "${serverJar}"`, {
            encoding: 'utf8',
            windowsHide: true,
            maxBuffer: 64 * 1024 * 1024,
        })
        const nestedNames = listing
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith('BOOT-INF/lib/') && line.endsWith('.jar'))
            .map((line) => line.slice('BOOT-INF/lib/'.length))
            .filter((name) => FAT_JAR_STUB_CANARY_PREFIXES.some((prefix) => name.startsWith(prefix)))
        if (!nestedNames.length) {
            throw new Error(`No canary datawise-* jars under BOOT-INF/lib in ${serverJar}`)
        }
        const stubs = []
        for (const name of nestedNames) {
            if (stubs.length >= 20) break
            const entry = `BOOT-INF/lib/${name}`
            execSync(`jar xf "${serverJar}" "${entry.replace(/\\/g, '/')}"`, {
                cwd: work,
                windowsHide: true,
                stdio: 'ignore',
                maxBuffer: 64 * 1024 * 1024,
            })
            const jarPath = join(work, 'BOOT-INF', 'lib', name)
            const extractDir = join(work, `extract-${name}`)
            mkdirSync(extractDir, {recursive: true})
            execSync(`jar xf "${jarPath}"`, {
                cwd: extractDir,
                windowsHide: true,
                stdio: 'ignore',
                maxBuffer: 64 * 1024 * 1024,
            })
            const walk = (dir, depth) => {
                if (depth > 24 || stubs.length >= 20) return
                let entries
                try {
                    entries = readdirSync(dir, {withFileTypes: true})
                } catch {
                    return
                }
                for (const ent of entries) {
                    const full = join(dir, ent.name)
                    if (ent.isDirectory()) {
                        walk(full, depth + 1)
                        continue
                    }
                    if (
                        ent.isFile()
                        && ent.name.endsWith('.class')
                        && classFileLooksLikeEclipseStub(full)
                    ) {
                        stubs.push(`${name}!${full.slice(extractDir.length + 1)}`)
                    }
                }
            }
            walk(extractDir, 0)
        }
        if (stubs.length) {
            const shown = stubs.slice(0, 8).join('\n  ')
            throw new Error(
                `Eclipse/JDT stub class(es) inside fat jar (packaging aborted):\n  ${shown}` +
                    (stubs.length > 8 ? `\n  …and ${stubs.length - 8} more` : '') +
                    `\nJar: ${serverJar}\nRe-run: npm run build:backend`,
            )
        }
        log('maven', `validated fat jar canaries (${nestedNames.length}) have no Eclipse stubs`)
    } finally {
        rmSync(work, {recursive: true, force: true})
    }
}

/**
 * Build server + desktop connector plugins into `target/`.
 * @param {{profile?: 'slim' | 'core' | 'full'}} [options]
 */
function installDesktopUiModule() {
    const desktopRoot = join(backendRoot, '..', 'datawise-desktop')
    // Bypass corporate Maven mirrors that rewrite JetBrains repos to Aliyun.
    ensureJetbrainsJcefMavenArtifact()
    log('maven', `installing datawise-desktop → local m2 (JetBrains JCEF)…`)
    run('mvn', [
        'install',
        ...MAVEN_SKIP_TEST_ARGS,
        ...MAVEN_STABLE_ARGS,
    ], desktopRoot)
}

export async function buildDesktopBackendMaven({profile = DEFAULT_DESKTOP_PROFILE} = {}) {
    const modules = backendModulesForProfile(profile)
    log(
        'maven',
        `building profile=${profile} modules=${modules.length} → target/ (tests skipped)…`,
    )
    // Windows: JDT/Eclipse often rewrites target/classes with "Unresolved compilation
    // problems" stubs mid-package; kill LS so Maven owns the output tree.
    const prevKillLs = process.env.DATAWISE_KILL_JAVA_LS
    process.env.DATAWISE_KILL_JAVA_LS = '1'
    try {
        await purgeBackendTargets()

        // Server desktop profile depends on org.apache.datawise:datawise-desktop.
        installDesktopUiModule()

        runMaven({
            goals: ['install'],
            modules,
            alsoMake: true,
        })

        const jar = resolveServerJar(serverTargetDir)
        assertSqlFlowStatementClass()
        assertNoEclipseCompilationStubs()
        assertFatJarHasNoEclipseCompilationStubs(jar)
        log('maven', `backend build OK → ${jar}`)
        return jar
    } finally {
        if (prevKillLs === undefined) delete process.env.DATAWISE_KILL_JAVA_LS
        else process.env.DATAWISE_KILL_JAVA_LS = prevKillLs
    }
}

/** Clean Maven `target/` outputs under datawise-backend. */
export async function cleanBackendMaven() {
    log('maven', 'cleaning datawise-backend packaging outputs…')
    await purgeBackendTargets()
    log('maven', 'backend build outputs cleared')
}

if (isDirectRun(import.meta.url)) {
    await buildDesktopBackendMaven()
}
