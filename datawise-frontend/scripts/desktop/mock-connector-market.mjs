/**
 * Local stand-in for GitHub Releases connector assets.
 *
 * Collects Maven connector plugin outputs (`*-plugin.jar` or main `datawise-connector-*-VERSION.jar`),
 * writes runtime-catalog.json with a loopback downloadUrl base, seeds config/market-cache
 * (+ optional user workspace), and serves the JARs over HTTP so marketplace "Install" works offline.
 *
 * Usage:
 *   node scripts/desktop/mock-connector-market.mjs
 *   node scripts/desktop/mock-connector-market.mjs --port 8765
 *   node scripts/desktop/mock-connector-market.mjs --no-serve   # catalog + cache only
 *   node scripts/desktop/mock-connector-market.mjs --seed-user  # also write into %APPDATA% workspace
 *   node scripts/desktop/mock-connector-market.mjs --build      # mvn package connectors first
 */
import {createServer} from 'node:http'
import {
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    statSync,
    unlinkSync,
} from 'node:fs'
import {basename, join} from 'node:path'
import {
    backendRoot,
    CONNECTOR_MODULES,
    configBundleOut,
    releaseDir,
    repoConfig,
    repoRoot,
} from './paths.mjs'
import {isDirectRun, log, run} from './lib.mjs'
import {generateRuntimeCatalog} from './generate-runtime-catalog.mjs'
import {MAVEN_SKIP_TEST_ARGS, MAVEN_STABLE_ARGS} from './maven.mjs'

const DEFAULT_PORT = 8765
const SKIP_MODULE_DIRS = new Set([
    'datawise-connector-api',
    'datawise-connector-spi',
    'datawise-connector-jdbc-runtime',
    'datawise-connector-all',
])

function parseArgs(argv) {
    let port = DEFAULT_PORT
    const portIdx = argv.indexOf('--port')
    if (portIdx >= 0 && argv[portIdx + 1]) {
        port = Number(argv[portIdx + 1]) || DEFAULT_PORT
    }
    return {
        port,
        serve: !argv.includes('--no-serve'),
        seedUser: argv.includes('--seed-user'),
        build: argv.includes('--build'),
    }
}

function isSkippableJarName(name) {
    const lower = name.toLowerCase()
    return (
        lower.endsWith('-sources.jar')
        || lower.endsWith('-javadoc.jar')
        || lower.endsWith('-tests.jar')
        || lower.startsWith('original-')
        || lower.includes('-shaded')
        || lower.endsWith('.jar.original')
    )
}

/**
 * Prefer thin `*-plugin.jar`; otherwise the module main artifact
 * `datawise-connector-<id>-<version>.jar` (JDBC connectors use this naming).
 * @param {string} moduleDirName e.g. datawise-connector-mysql
 * @param {string[]} names
 */
function pickModulePluginJar(moduleDirName, names) {
    const candidates = names.filter((name) => name.endsWith('.jar') && !isSkippableJarName(name))
    const plugin = candidates.find((name) => name.endsWith('-plugin.jar') && name.startsWith(moduleDirName + '-'))
    if (plugin) return plugin
    // Main artifact: datawise-connector-mysql-4.1.6.jar (not -tests / -sources)
    const main = candidates
        .filter((name) => name.startsWith(moduleDirName + '-') && !name.includes('-plugin'))
        .sort()
    return main[0] || null
}

function collectPluginJars() {
    const connectorsRoot = join(backendRoot, 'datawise-connectors')
    /** @type {Map<string, string>} */
    const byName = new Map()
    if (!existsSync(connectorsRoot)) return byName
    for (const dir of readdirSync(connectorsRoot)) {
        if (!dir.startsWith('datawise-connector-') || SKIP_MODULE_DIRS.has(dir)) continue
        const target = join(connectorsRoot, dir, 'target')
        if (!existsSync(target)) continue
        const picked = pickModulePluginJar(dir, readdirSync(target))
        if (!picked) continue
        byName.set(picked, join(target, picked))
    }
    return byName
}

function buildAllConnectors() {
    const connectorsRoot = join(backendRoot, 'datawise-connectors')
    const fromDisk = existsSync(connectorsRoot)
        ? readdirSync(connectorsRoot)
            .filter((d) => d.startsWith('datawise-connector-') && !SKIP_MODULE_DIRS.has(d))
            .map((d) => `datawise-connectors/${d}`)
        : []
    const pl = [...new Set([...CONNECTOR_MODULES, ...fromDisk])].join(',')
    log('mock-market', `mvn package connectors (${pl.split(',').length} modules)…`)
    run(
        'mvn',
        [
            '-f',
            join(backendRoot, 'pom.xml'),
            ...MAVEN_SKIP_TEST_ARGS,
            ...MAVEN_STABLE_ARGS,
            '-pl',
            pl,
            '-am',
            'package',
        ],
        backendRoot,
    )
}

function syncJarsToDir(jars, destDir) {
    mkdirSync(destDir, {recursive: true})
    let copied = 0
    for (const [name, src] of jars) {
        cpSync(src, join(destDir, name))
        copied += 1
    }
    return copied
}

/** @param {string} dir @param {Iterable<string>} jarNames */
function removeJarsFromDir(dir, jarNames) {
    if (!existsSync(dir)) return 0
    let removed = 0
    for (const name of jarNames) {
        const path = join(dir, name)
        if (!existsSync(path)) continue
        try {
            unlinkSync(path)
            removed += 1
        } catch {
            // locked — leave for next reload / JVM exit
        }
    }
    return removed
}

/**
 * Wipe classloader copies under plugins/.runtime (exact names + unique *.NNNN.jar siblings).
 * Locked files are renamed to *.pending-delete when unlink fails.
 */
function clearRuntimeCopies(runtimeDir) {
    if (!existsSync(runtimeDir)) return 0
    let removed = 0
    for (const name of readdirSync(runtimeDir)) {
        if (!name.includes('datawise-connector-')) continue
        if (!name.toLowerCase().endsWith('.jar') && !name.endsWith('.pending-delete')) continue
        const path = join(runtimeDir, name)
        try {
            unlinkSync(path)
            removed += 1
        } catch {
            if (name.endsWith('.pending-delete')) continue
            try {
                renameSync(path, path + '.pending-delete')
                removed += 1
            } catch {
                // still locked by JVM
            }
        }
    }
    return removed
}

function resolveUserWorkspaceConfig() {
    const appData = process.env.APPDATA
    if (!appData) return null
    const workspaces = join(appData, 'DataWiseCLI', 'workspaces')
    if (existsSync(join(workspaces, 'workspace.xml')) || existsSync(join(workspaces, 'plugins'))) {
        return workspaces
    }
    return null
}

function contentType(fileName) {
    if (fileName.endsWith('.json')) return 'application/json; charset=utf-8'
    if (fileName.endsWith('.jar')) return 'application/java-archive'
    return 'application/octet-stream'
}

function startStaticServer(rootDir, port) {
    const server = createServer((req, res) => {
        try {
            const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
            let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
            if (!rel || rel.endsWith('/')) rel = `${rel}runtime-catalog.json`.replace(/^\//, '')
            if (rel.includes('..') || rel.includes('\\')) {
                res.writeHead(400)
                res.end('bad path')
                return
            }
            const filePath = join(rootDir, rel)
            if (!existsSync(filePath) || !statSync(filePath).isFile()) {
                res.writeHead(404)
                res.end(`not found: ${rel}`)
                return
            }
            const body = readFileSync(filePath)
            res.writeHead(200, {
                'Content-Type': contentType(basename(filePath)),
                'Content-Length': body.length,
                'Cache-Control': 'no-store',
            })
            res.end(body)
        } catch (err) {
            res.writeHead(500)
            res.end(err instanceof Error ? err.message : String(err))
        }
    })
    return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => resolve(server))
    })
}

async function main() {
    const opts = parseArgs(process.argv.slice(2))
    if (opts.build) {
        buildAllConnectors()
    }
    const jars = collectPluginJars()
    if (jars.size === 0) {
        throw new Error(
            'No connector plugin JARs under datawise-connectors/*/target. '
                + 'Run with --build, or: npm run mock:connector-market -- --build --no-serve',
        )
    }

    const staging = join(releaseDir, 'local-connector-cdn')
    mkdirSync(staging, {recursive: true})
    const pluginsStaging = join(staging, 'jars')
    // Fresh staging so removed modules do not linger in the local CDN.
    if (existsSync(pluginsStaging)) {
        for (const name of readdirSync(pluginsStaging)) {
            if (name.endsWith('.jar') || name === 'runtime-catalog.json') {
                try {
                    unlinkSync(join(pluginsStaging, name))
                } catch {
                    // ignore
                }
            }
        }
    }
    const copied = syncJarsToDir(jars, pluginsStaging)
    log('mock-market', `staged ${copied} connector JAR(s) → ${pluginsStaging}`)

    // Market-cache + CDN only. Do NOT dump every JAR into config/plugins —
    // otherwise one "Install from URL" + hot-reload loads the whole set.
    const repoMarketCache = join(repoConfig, 'market-cache')
    syncJarsToDir(jars, repoMarketCache)
    const repoPlugins = join(repoConfig, 'plugins')
    const removedFromPlugins = removeJarsFromDir(repoPlugins, jars.keys())
    const removedRuntime = clearRuntimeCopies(join(repoPlugins, '.runtime'))
    if (removedFromPlugins + removedRuntime > 0) {
        log(
            'mock-market',
            `cleared ${removedFromPlugins} from config/plugins + ${removedRuntime} from .runtime (install one-by-one from market)`,
        )
    }

    const baseUrl = `http://127.0.0.1:${opts.port}/`
    const catalogPath = join(staging, 'runtime-catalog.json')
    await generateRuntimeCatalog({
        pluginsDir: pluginsStaging,
        out: catalogPath,
        baseUrl,
    })
    // Mirror catalog next to jars so GET /runtime-catalog.json and /<jar> both work.
    cpSync(catalogPath, join(pluginsStaging, 'runtime-catalog.json'))

    const catalogTargets = [
        join(repoConfig, 'runtime-catalog.json'),
        join(configBundleOut, 'runtime-catalog.json'),
        join(repoRoot, 'datawise-frontend', 'resources', 'bundle-config', 'runtime-catalog.json'),
    ]
    for (const dest of catalogTargets) {
        mkdirSync(join(dest, '..'), {recursive: true})
        cpSync(catalogPath, dest)
        log('mock-market', `catalog → ${dest}`)
    }

    // Packaged layout market-cache (install-root fallback).
    if (existsSync(configBundleOut)) {
        const bundleCache = join(configBundleOut, 'market-cache')
        syncJarsToDir(jars, bundleCache)
        log('mock-market', `market-cache → ${bundleCache}`)
    }

    if (opts.seedUser) {
        const userCfg = resolveUserWorkspaceConfig()
        if (userCfg) {
            syncJarsToDir(jars, join(userCfg, 'market-cache'))
            cpSync(catalogPath, join(userCfg, 'runtime-catalog.json'))
            // Do not auto-copy into plugins/ (that would skip the install flow).
            log('mock-market', `seeded user workspace catalog + market-cache → ${userCfg}`)
        } else {
            log('mock-market', 'no user workspace found under %APPDATA%/DataWiseCLI/workspaces — skip --seed-user')
        }
    }

    log('mock-market', `download baseUrl=${baseUrl}`)
    log('mock-market', 'Install flow: market-cache is tried first; HTTP mock covers remote downloadUrl.')

    if (!opts.serve) {
        log('mock-market', 'done (--no-serve)')
        return
    }

    const server = await startStaticServer(pluginsStaging, opts.port)
    log('mock-market', `serving ${pluginsStaging}`)
    log('mock-market', `GET ${baseUrl}runtime-catalog.json`)
    log('mock-market', 'Keep this process running, then in the app: refresh Connector Market → Install.')
    log('mock-market', 'Ctrl+C to stop.')

    await new Promise(() => {
        // keep alive until SIGINT
        process.on('SIGINT', () => {
            server.close()
            process.exit(0)
        })
    })
}

if (isDirectRun(import.meta.url)) {
    main().catch((err) => {
        console.error('[mock-market]', err instanceof Error ? err.message : err)
        process.exit(1)
    })
}
