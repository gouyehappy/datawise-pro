/**
 * Clean desktop build outputs.
 *
 *   --release      release/ only
 *   --all          frontend artifacts + resources/desktop + backend target/
 */
import {existsSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {
    desktopBundleRoot,
    frontendRoot,
    releaseDir,
} from './paths.mjs'
import {isDirectRun, log, removePathRobust, stopDesktopProcesses} from './lib.mjs'
import {cleanBackendMaven} from './maven.mjs'

async function cleanReleaseDir() {
    stopDesktopProcesses()
    if (existsSync(releaseDir)) {
        await removePathRobust(releaseDir, {
            tag: 'clean',
            onRetry: stopDesktopProcesses,
        })
    }
    log('clean', 'ready: release/')
    return 'release'
}

async function cleanAll() {
    stopDesktopProcesses()

    const paths = [
        join(frontendRoot, 'dist'),
        releaseDir,
        desktopBundleRoot,
        join(frontendRoot, 'node_modules/.vite'),
    ]

    for (const name of readdirSync(frontendRoot)) {
        if (name.startsWith('release-')) {
            paths.push(join(frontendRoot, name))
        }
    }

    for (const path of paths) {
        try {
            await removePathRobust(path, {
                tag: 'clean',
                onRetry: stopDesktopProcesses,
            })
        } catch (error) {
            // On Windows, release artifacts are frequently locked by Explorer previews
            // or anti-virus scanning. Keep --all best-effort for release paths.
            const isReleasePath = path === releaseDir || path.includes(`${join(frontendRoot, 'release-')}`)
            if (isReleasePath) {
                const message = error instanceof Error ? error.message : String(error)
                log('clean', `skip locked release artifact: ${path} (${message})`)
                continue
            }
            throw error
        }
    }

    await cleanBackendMaven()
    log('clean', 'all packaging artifacts cleared')
}

/**
 * @param {'release'|'all'} [mode]
 */
export async function cleanDesktop(mode = 'release') {
    if (mode === 'all') {
        await cleanAll()
        return 'release'
    }
    return cleanReleaseDir()
}

if (isDirectRun(import.meta.url)) {
    const mode = process.argv.includes('--all') ? 'all' : 'release'
    await cleanDesktop(mode)
}
