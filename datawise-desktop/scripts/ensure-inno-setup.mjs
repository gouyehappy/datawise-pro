/**
 * Ensure Inno Setup 6 (ISCC.exe) is available for the custom Windows installer.
 * Downloads + silent-installs into datawise-desktop/target/inno-setup/ when missing.
 */
import {spawnSync} from 'node:child_process'
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDir = join(fileURLToPath(import.meta.url), '..')
const desktopRoot = join(scriptDir, '..')

/** Prefer a recent Inno Setup 6; fall back to GitHub release asset. */
export const INNO_SETUP_VERSION = '6.7.3'
export const INNO_SETUP_URL =
    `https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-${INNO_SETUP_VERSION}.exe`

function log(msg) {
    console.log(`[inno-setup] ${msg}`)
}

function candidateIsccPaths(cacheRoot) {
    return [
        process.env.INNO_SETUP_ISCC,
        process.env.ISCC,
        join(cacheRoot, 'ISCC.exe'),
        join(process.env['ProgramFiles(x86)'] || '', 'Inno Setup 6', 'ISCC.exe'),
        join(process.env.ProgramFiles || '', 'Inno Setup 6', 'ISCC.exe'),
        join(process.env['ProgramFiles(x86)'] || '', 'Inno Setup 5', 'ISCC.exe'),
    ].filter(Boolean)
}

function tryWingetInstall() {
    const winget = spawnSync(
        'winget',
        [
            'install',
            '--id',
            'JRSoftware.InnoSetup',
            '-e',
            '--accept-package-agreements',
            '--accept-source-agreements',
        ],
        {encoding: 'utf8', shell: true, windowsHide: true},
    )
    return winget.status === 0
}

/**
 * @param {string} [cacheRoot]
 * @returns {Promise<string>} absolute path to ISCC.exe
 */
export async function ensureInnoSetup(cacheRoot = join(desktopRoot, 'target', 'inno-setup')) {
    for (const p of candidateIsccPaths(cacheRoot)) {
        if (existsSync(p)) {
            log(`using ${p}`)
            return p
        }
    }

    log('ISCC not found — trying winget JRSoftware.InnoSetup…')
    if (tryWingetInstall()) {
        for (const p of candidateIsccPaths(cacheRoot)) {
            if (existsSync(p)) {
                log(`using ${p}`)
                return p
            }
        }
    }

    mkdirSync(cacheRoot, {recursive: true})
    const installer = join(tmpdir(), `innosetup-${INNO_SETUP_VERSION}.exe`)
    log(`downloading ${INNO_SETUP_URL}`)
    const curl = spawnSync(
        'curl',
        ['-fL', '--retry', '3', '-o', installer, INNO_SETUP_URL],
        {encoding: 'utf8', shell: true},
    )
    if (curl.status !== 0 || !existsSync(installer)) {
        const ps = spawnSync(
            'powershell',
            [
                '-NoProfile',
                '-Command',
                `Invoke-WebRequest -Uri '${INNO_SETUP_URL}' -OutFile '${installer}'`,
            ],
            {encoding: 'utf8', shell: false},
        )
        if (ps.status !== 0 || !existsSync(installer)) {
            throw new Error(
                `Failed to obtain Inno Setup ${INNO_SETUP_VERSION}. ` +
                    `Install manually: winget install JRSoftware.InnoSetup`,
            )
        }
    }

    log(`silent-install → ${cacheRoot}`)
    const install = spawnSync(
        installer,
        [
            '/VERYSILENT',
            '/SUPPRESSMSGBOXES',
            '/NORESTART',
            '/SP-',
            `/DIR=${cacheRoot}`,
        ],
        {encoding: 'utf8', shell: false, windowsHide: true},
    )
    if (install.status !== 0) {
        throw new Error(
            `Inno Setup silent install failed (exit ${install.status}): ${install.stderr || install.stdout || ''}`,
        )
    }

    const iscc = join(cacheRoot, 'ISCC.exe')
    if (!existsSync(iscc)) {
        // winget / default path after silent to Program Files
        for (const p of candidateIsccPaths(cacheRoot)) {
            if (existsSync(p)) {
                log(`using ${p}`)
                return p
            }
        }
        throw new Error(`ISCC.exe missing after install at ${cacheRoot}`)
    }
    writeFileSync(join(cacheRoot, 'VERSION.txt'), INNO_SETUP_VERSION, 'utf8')
    log(`ready ${iscc}`)
    try {
        rmSync(installer, {force: true})
    } catch {
        // ignore
    }
    return iscc
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    ensureInnoSetup()
        .then((p) => {
            console.log(p)
        })
        .catch((e) => {
            console.error(e)
            process.exit(1)
        })
}
