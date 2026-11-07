/**
 * Download and extract JetBrains Runtime with JCEF (jbr_jcef) for jpackage --runtime-image.
 */
import {spawnSync} from 'node:child_process'
import {existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync} from 'node:fs'
import {arch as osArch, platform as osPlatform} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isDirectRun} from '../../datawise-frontend/scripts/desktop/lib.mjs'

/** Pinned JBR+JCEF build (Java 17). */
export const JBR_JCEF_BUILD = 'jbr_jcef-17.0.12'
export const JBR_JCEF_BUILD_SUFFIX = 'b1207.37'
export const JBR_BASE_URL = 'https://cache-redirector.jetbrains.com/intellij-jbr'

/**
 * @returns {{archive: string, homeRelative: string, frameworksRelative: string|null}}
 */
export function resolveJbrArtifact() {
    const plat = osPlatform()
    const cpu = osArch()
    const isArm = cpu === 'arm64' || cpu === 'aarch64'
    if (plat === 'win32') {
        return {
            archive: `${JBR_JCEF_BUILD}-windows-x64-${JBR_JCEF_BUILD_SUFFIX}.tar.gz`,
            homeRelative: '.',
            frameworksRelative: null,
        }
    }
    if (plat === 'darwin') {
        const arch = isArm ? 'aarch64' : 'x64'
        return {
            archive: `${JBR_JCEF_BUILD}-osx-${arch}-${JBR_JCEF_BUILD_SUFFIX}.tar.gz`,
            homeRelative: 'Contents/Home',
            frameworksRelative: 'Contents/Frameworks',
        }
    }
    if (plat === 'linux') {
        const arch = isArm ? 'aarch64' : 'x64'
        return {
            archive: `${JBR_JCEF_BUILD}-linux-${arch}-${JBR_JCEF_BUILD_SUFFIX}.tar.gz`,
            homeRelative: '.',
            frameworksRelative: null,
        }
    }
    throw new Error(`unsupported platform for jbr_jcef: ${plat}`)
}

function log(msg) {
    console.log(`[jbr_jcef] ${msg}`)
}

function curlBin() {
    return process.platform === 'win32' ? 'curl.exe' : 'curl'
}

/**
 * @param {string} cacheRoot absolute path for downloads + extracted runtime
 * @returns {Promise<{home: string, frameworks: string|null, extractRoot: string}>}
 */
export async function ensureJbrJcef(cacheRoot) {
    const meta = resolveJbrArtifact()
    const destRoot = join(cacheRoot, meta.archive.replace(/\.tar\.gz$/, ''))
    const home = join(destRoot, meta.homeRelative === '.' ? '' : meta.homeRelative)
    // normalize when homeRelative is '.'
    const javaHome = meta.homeRelative === '.' ? destRoot : home
    const javaBin = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    const frameworks =
        meta.frameworksRelative != null ? join(destRoot, meta.frameworksRelative) : null

    if (existsSync(javaBin)) {
        log(`using cached runtime ${javaHome}`)
        return {home: javaHome, frameworks, extractRoot: destRoot}
    }

    mkdirSync(cacheRoot, {recursive: true})
    const archivePath = join(cacheRoot, meta.archive)
    const url = `${JBR_BASE_URL}/${meta.archive}`

    if (!existsSync(archivePath) || statSync(archivePath).size < 1_000_000) {
        log(`downloading ${url}`)
        const curl = spawnSync(
            curlBin(),
            ['--fail', '--location', '--retry', '3', '--output', archivePath, url],
            {stdio: 'inherit', shell: false},
        )
        if (curl.status !== 0) {
            throw new Error(`failed to download jbr_jcef (${curl.status})`)
        }
    } else {
        log(`archive present ${archivePath}`)
    }

    const tmpExtract = join(cacheRoot, `_extract_${Date.now()}`)
    rmSync(tmpExtract, {recursive: true, force: true})
    mkdirSync(tmpExtract, {recursive: true})

    log(`extracting ${meta.archive}…`)
    const tar = spawnSync('tar', ['-xzf', archivePath, '-C', tmpExtract], {
        stdio: 'inherit',
        shell: false,
    })
    if (tar.status !== 0) {
        throw new Error(`tar extract failed (${tar.status})`)
    }

    // Archive usually contains a single top-level directory.
    const kids = readdirSync(tmpExtract).filter((n) => !n.startsWith('.'))
    const top = kids.length === 1 ? join(tmpExtract, kids[0]) : tmpExtract

    rmSync(destRoot, {recursive: true, force: true})
    mkdirSync(cacheRoot, {recursive: true})
    renameSync(top, destRoot)
    rmSync(tmpExtract, {recursive: true, force: true})

    if (!existsSync(javaBin)) {
        throw new Error(`jbr_jcef extract missing java at ${javaBin}`)
    }
    log(`ready ${javaHome}`)
    return {home: javaHome, frameworks, extractRoot: destRoot}
}

if (isDirectRun(import.meta.url)) {
    const cacheRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'target', 'jbr-cache')
    ensureJbrJcef(cacheRoot)
        .then((r) => {
            console.log(`[jbr_jcef] home=${r.home}`)
            if (r.frameworks) {
                console.log(`[jbr_jcef] frameworks=${r.frameworks}`)
            }
        })
        .catch((e) => {
            console.error('[jbr_jcef]', e instanceof Error ? e.message : e)
            process.exit(1)
        })
}
