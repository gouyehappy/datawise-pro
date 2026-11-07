/**
 * Build desktop server JAR, config template, and connector plugins.
 *
 * Prerequisites: JAVA_HOME (JDK 17+), Maven.
 * Output: resources/desktop/{backend,config-bundle}
 *
 * The packaged app embeds JetBrains Runtime with JCEF (`jbr_jcef`) via jpackage
 * `--runtime-image`; this step does **not** copy a second JRE under backend/jre.
 *
 * Profiles (connectors only):
 *   slim — no connector JARs (catalog only)
 *   core — curated connectors (default)
 *   full — all in-tree connectors
 *
 * JDBC drivers are never copied into the install layout — first connect downloads
 * via Maven into the user's config/drivers/ (see DESKTOP_PACKAGING.md).
 *
 * Maven always skips tests (see maven.mjs).
 */
import {cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {
    backendBundleOut,
    bundleConfigSrc,
    configBundleOut,
    CORE_CONNECTOR_JAR_PREFIXES,
    DEFAULT_DESKTOP_PROFILE,
    desktopBundleRoot,
    parseDesktopProfile,
    repoConfig,
    serverTargetDir,
} from './paths.mjs'
import {
    copyDirSync,
    copyJarFiles,
    findServerJar,
    isDirectRun,
    log,
    removePathRobust,
    stopDesktopProcesses,
} from './lib.mjs'
import {buildDesktopBackendMaven} from './maven.mjs'
import {generateRuntimeCatalog} from './generate-runtime-catalog.mjs'
import {buildAppCds} from './build-cds.mjs'

/**
 * @param {'slim' | 'core' | 'full'} profile
 * @param {string} pluginsSrc
 * @param {string} pluginsOut
 */
function copyPluginsForProfile(profile, pluginsSrc, pluginsOut) {
    if (profile === 'slim') {
        log('bundle-backend', 'profile=slim — no connector JARs in bundle (catalog only)')
        return 0
    }
    if (profile === 'core') {
        return copyJarFiles(pluginsSrc, pluginsOut, '.jar', (name) =>
            CORE_CONNECTOR_JAR_PREFIXES.some((prefix) => name.startsWith(prefix)),
        )
    }
    return copyJarFiles(pluginsSrc, pluginsOut)
}

async function assembleBundle(serverJar, profile) {
    await removePathRobust(desktopBundleRoot, {
        tag: 'bundle-backend',
        onRetry: stopDesktopProcesses,
    })

    mkdirSync(backendBundleOut, {recursive: true})
    cpSync(serverJar, join(backendBundleOut, 'datawise-server.jar'))
    log('bundle-backend', `copied ${serverJar}`)

    // Runtime+JCEF comes from jbr_jcef at jpackage time — do not ship backend/jre.
    const staleJre = join(backendBundleOut, 'jre')
    if (existsSync(staleJre)) {
        rmSync(staleJre, {recursive: true, force: true})
        log('bundle-backend', 'removed stale backend/jre (jbr_jcef supplies runtime)')
    }

    copyDirSync(bundleConfigSrc, configBundleOut)

    const pluginsOut = join(configBundleOut, 'plugins')
    const driversOut = join(configBundleOut, 'drivers')
    rmSync(join(pluginsOut, '.gitkeep'), {force: true})
    rmSync(join(driversOut, '.gitkeep'), {force: true})

    const pluginsSrc = join(repoConfig, 'plugins')
    await generateRuntimeCatalog({
        pluginsDir: pluginsSrc,
        out: join(configBundleOut, 'runtime-catalog.json'),
    })

    const pluginCount = copyPluginsForProfile(profile, pluginsSrc, pluginsOut)
    const marketCacheCount = copyMarketCache(pluginsSrc, join(configBundleOut, 'market-cache'), pluginsOut)
    const skippedDriverJars = countDriverJars(join(repoConfig, 'drivers'))
    ensureEmptyDriversDir(driversOut)
    if (skippedDriverJars > 0) {
        log(
            'bundle-backend',
            `skipped ${skippedDriverJars} JAR(s) under config/drivers/ — desktop ships empty drivers/; download on first connect`,
        )
    }
    log(
        'bundle-backend',
        `profile=${profile} plugins: ${pluginCount}, market-cache: ${marketCacheCount}, drivers: 0 (download-on-connect)`,
    )

    writeFileSync(
        join(configBundleOut, 'desktop-packaging.json'),
        `${JSON.stringify(
            {
                profile,
                connectors: profile === 'slim' ? 'market-only' : profile === 'full' ? 'all' : 'curated',
                drivers: 'download-on-connect',
            },
            null,
            2,
        )}\n`,
        'utf8',
    )

    for (const sub of ['logs', 'cache/schema', 'scripts', 'ai-checkpoints']) {
        mkdirSync(join(configBundleOut, sub), {recursive: true})
    }
}

function countDriverJars(driversSrc) {
    if (!existsSync(driversSrc)) return 0
    return readdirSync(driversSrc).filter((name) => name.endsWith('.jar')).length
}

/**
 * Offline marketplace JARs for connectors not preloaded into config/plugins.
 * Install prefers market-cache over GitHub downloadUrl (needed when GitHub is unreachable).
 */
function copyMarketCache(pluginsSrc, marketCacheOut, pluginsOut) {
    mkdirSync(marketCacheOut, {recursive: true})
    if (!existsSync(pluginsSrc)) return 0
    const loaded = new Set(
        existsSync(pluginsOut)
            ? readdirSync(pluginsOut).filter((name) => name.endsWith('.jar'))
            : [],
    )
    let copied = 0
    for (const name of readdirSync(pluginsSrc)) {
        if (!name.endsWith('.jar') || loaded.has(name)) continue
        cpSync(join(pluginsSrc, name), join(marketCacheOut, name))
        copied += 1
    }
    return copied
}

/** Desktop installers never ship JDBC driver JARs — keep an empty placeholder dir. */
function ensureEmptyDriversDir(driversOut) {
    mkdirSync(driversOut, {recursive: true})
    for (const name of readdirSync(driversOut)) {
        if (name.endsWith('.jar')) {
            rmSync(join(driversOut, name), {force: true})
        }
    }
    writeFileSync(
        join(driversOut, 'README.txt'),
        [
            'JDBC drivers are not bundled with the desktop installer.',
            'On first connect, DataWise downloads the driver from Maven into this folder',
            '(or place JARs here manually for offline hosts).',
            '',
        ].join('\n'),
        'utf8',
    )
}

/**
 * @param {{skipMaven?: boolean, profile?: 'slim' | 'core' | 'full'}} [options]
 */
export async function bundleBackend({skipMaven = false, profile = DEFAULT_DESKTOP_PROFILE} = {}) {
    log('bundle-backend', `desktop packaging profile: ${profile}`)

    if (!skipMaven) {
        await buildDesktopBackendMaven({profile})
    }

    const serverJar = findServerJar(serverTargetDir)
    log('bundle-backend', `using server jar ${serverJar}`)
    await assembleBundle(serverJar, profile)

    // AppCDS via jbr_jcef — fail-open so a training glitch never blocks packaging.
    try {
        await buildAppCds()
        log('bundle-backend', 'AppCDS archive ready (datawise.jsa)')
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log('bundle-backend', `AppCDS skipped (fail-open): ${message}`)
        rmSync(join(backendBundleOut, 'datawise.jsa'), {force: true})
        rmSync(join(backendBundleOut, 'datawise.jsa.meta.json'), {force: true})
    }
    log('bundle-backend', `desktop bundle ready at ${desktopBundleRoot}`)
}

if (isDirectRun(import.meta.url)) {
    const skipMaven = process.argv.includes('--skip-maven')
    const profile = parseDesktopProfile(process.argv.slice(2))
    await bundleBackend({skipMaven, profile})
}
