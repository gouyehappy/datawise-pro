/**
 * Build a trimmed JRE with jlink for desktop core profile.
 * Falls back to false when jlink is unavailable or fails.
 *
 * Also exports {@link stripJreBloat} for full-JDK copies (removes src.zip / CDS / ct.sym).
 */
import {existsSync, readdirSync, renameSync, rmSync, cpSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {log} from './lib.mjs'

/** Modules needed by Spring Boot + JCEF desktop host. */
const JLINK_MODULES = [
    'java.base',
    'java.logging',
    'java.xml',
    'java.naming',
    'java.sql',
    'java.management',
    'java.instrument',
    'java.desktop',
    'java.net.http',
    'java.security.jgss',
    'java.security.sasl',
    'java.rmi',
    'java.scripting',
    'java.transaction.xa',
    'java.prefs',
    'jdk.crypto.ec',
    'jdk.crypto.cryptoki',
    'jdk.localedata',
    'jdk.unsupported',
    'jdk.management',
    'jdk.zipfs',
    'jdk.charsets',
]

const BLOAT_FILE_NAMES = new Set([
    'src.zip',
    'ct.sym',
])

/**
 * Remove JDK files that are never needed at runtime (src.zip alone is ~40MB).
 * Safe on both jlink images and full JRE copies.
 * @param {string} jreHome
 * @returns {number} bytes removed
 */
export function stripJreBloat(jreHome) {
    if (!jreHome || !existsSync(jreHome)) {
        return 0
    }
    let removed = 0
    const stack = [jreHome]
    while (stack.length > 0) {
        const dir = stack.pop()
        let entries
        try {
            entries = readdirSync(dir, {withFileTypes: true})
        } catch {
            continue
        }
        for (const ent of entries) {
            const full = join(dir, ent.name)
            if (ent.isDirectory()) {
                stack.push(full)
                continue
            }
            if (!ent.isFile()) {
                continue
            }
            const lower = ent.name.toLowerCase()
            const drop =
                BLOAT_FILE_NAMES.has(ent.name) ||
                lower.endsWith('.jsa') ||
                lower.endsWith('.diz')
            if (!drop) {
                continue
            }
            try {
                removed += statSync(full).size
                rmSync(full, {force: true})
            } catch {
                // best-effort
            }
        }
    }
    if (removed > 0) {
        log('jlink-jre', `stripped ${(removed / (1024 * 1024)).toFixed(1)} MB of JRE bloat from ${jreHome}`)
    }
    return removed
}

/**
 * @param {string} javaHome
 * @param {string} dest
 * @returns {boolean} true when jlink output is ready
 */
export function buildJlinkJre(javaHome, dest) {
    const jlinkBin = process.platform === 'win32'
        ? join(javaHome, 'bin', 'jlink.exe')
        : join(javaHome, 'bin', 'jlink')
    if (!existsSync(jlinkBin)) {
        log('jlink-jre', `jlink not found at ${jlinkBin}`)
        return false
    }

    const tempDest = `${dest}.jlink-tmp`
    // jlink requires the output path to not exist yet.
    rmSync(tempDest, {recursive: true, force: true})

    // Prefer zip compression when supported (JDK 21+); fall back to legacy --compress=2.
    const attempts = [
        [
            `--add-modules=${JLINK_MODULES.join(',')}`,
            '--strip-debug',
            '--no-header-files',
            '--no-man-pages',
            '--compress=zip-6',
            `--output=${tempDest}`,
        ],
        [
            `--add-modules=${JLINK_MODULES.join(',')}`,
            '--strip-debug',
            '--no-header-files',
            '--no-man-pages',
            '--compress=2',
            `--output=${tempDest}`,
        ],
    ]

    let ok = false
    for (const args of attempts) {
        rmSync(tempDest, {recursive: true, force: true})
        log('jlink-jre', `running jlink → ${tempDest}`)
        const result = spawnSync(jlinkBin, args, {stdio: 'inherit', shell: false})
        if (result.status === 0) {
            ok = true
            break
        }
        log('jlink-jre', 'jlink attempt failed — trying fallback flags…')
    }
    if (!ok) {
        rmSync(tempDest, {recursive: true, force: true})
        log('jlink-jre', 'jlink failed — caller should fall back to full JRE copy')
        return false
    }

    const javaBin = process.platform === 'win32'
        ? join(tempDest, 'bin', 'java.exe')
        : join(tempDest, 'bin', 'java')
    if (!existsSync(javaBin)) {
        rmSync(tempDest, {recursive: true, force: true})
        log('jlink-jre', `jlink output missing ${javaBin}`)
        return false
    }

    rmSync(dest, {recursive: true, force: true})
    try {
        renameSync(tempDest, dest)
    } catch {
        cpSync(tempDest, dest, {recursive: true})
        rmSync(tempDest, {recursive: true, force: true})
    }
    stripJreBloat(dest)
    log('jlink-jre', `jlink JRE ready at ${dest}`)
    return true
}
