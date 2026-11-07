/**
 * Align frontend + Maven project versions with a release tag (e.g. 4.0.6).
 *
 * Usage:
 *   node scripts/desktop/align-release-version.mjs 4.0.6
 *   node scripts/desktop/align-release-version.mjs --from-env   # GITHUB_REF_NAME=v4.0.6
 *
 * Critical: tag builds must bump datawise-backend AND datawise-desktop together.
 * Bumping only datawise-desktop leaves datawise-server resolving desktop:4.1.4 → CI fail.
 *
 * Idempotent: if versions are already at the target, this is a no-op success.
 */
import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const repoRoot = join(frontendRoot, '..')
const backendRoot = join(repoRoot, 'datawise-backend')
const desktopPom = join(repoRoot, 'datawise-desktop', 'pom.xml')

function resolveVersion(argv) {
    if (argv.includes('--from-env')) {
        const ref = process.env.GITHUB_REF_NAME || ''
        if (!/^v?\d+\.\d+\.\d+/.test(ref)) {
            throw new Error(`GITHUB_REF_NAME must look like v4.0.6, got: ${ref || '(empty)'}`)
        }
        return ref.replace(/^v/, '')
    }
    const raw = argv.find((a) => !a.startsWith('-'))
    if (!raw) {
        throw new Error('Usage: align-release-version.mjs <version>|--from-env')
    }
    return String(raw).replace(/^v/, '')
}

function npmVersion(version) {
    const result = spawnSync(
        'npm',
        ['version', version, '--no-git-tag-version', '--allow-same-version'],
        {cwd: frontendRoot, stdio: 'inherit', shell: process.platform === 'win32'},
    )
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}

/** Rewrite org.apache.datawise:* module/parent versions in a POM (never ${…} properties). */
function bumpDatawiseVersions(xml, version) {
    return xml.replace(
        /(<groupId>org\.apache\.datawise<\/groupId>\s*<artifactId>[^<]+<\/artifactId>\s*)<version>\d+\.\d+\.\d+[^<]*<\/version>/g,
        `$1<version>${version}</version>`,
    )
}

function hasModuleVersion(xml, artifactId, version) {
    const pattern = new RegExp(
        `<groupId>org\\.apache\\.datawise<\\/groupId>\\s*<artifactId>${artifactId}<\\/artifactId>\\s*<version>${version.replace(/\./g, '\\.')}<\\/version>`,
    )
    return pattern.test(xml)
}

function setDesktopVersion(version) {
    const before = readFileSync(desktopPom, 'utf8')
    if (hasModuleVersion(before, 'datawise-desktop', version)) {
        console.log(`[align-version] datawise-desktop already ${version}`)
        return
    }
    const after = bumpDatawiseVersions(before, version)
    if (after === before || !hasModuleVersion(after, 'datawise-desktop', version)) {
        throw new Error(`Could not bump datawise-desktop version in ${desktopPom}`)
    }
    writeFileSync(desktopPom, after, 'utf8')
    console.log(`[align-version] datawise-desktop → ${version}`)
}

function collectPomFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'target' || name === 'node_modules') continue
        const full = join(dir, name)
        const st = statSync(full)
        if (st.isDirectory()) {
            collectPomFiles(full, out)
        } else if (name === 'pom.xml') {
            out.push(full)
        }
    }
    return out
}

function setBackendVersions(version) {
    const poms = collectPomFiles(backendRoot)
    let changed = 0
    let alreadyOk = 0
    for (const pom of poms) {
        const before = readFileSync(pom, 'utf8')
        const after = bumpDatawiseVersions(before, version)
        if (after === before) {
            if (
                hasModuleVersion(before, 'datawise-backend', version)
                || /<groupId>org\.apache\.datawise<\/groupId>\s*<artifactId>datawise-[^<]+<\/artifactId>\s*<version>/.test(before)
            ) {
                // Parent/module version lines either already target or use ${project.version}
                alreadyOk += 1
            }
            continue
        }
        writeFileSync(pom, after, 'utf8')
        changed += 1
    }
    const rootPom = readFileSync(join(backendRoot, 'pom.xml'), 'utf8')
    if (!hasModuleVersion(rootPom, 'datawise-backend', version)) {
        throw new Error(`datawise-backend root POM is not at version ${version}`)
    }
    console.log(
        `[align-version] datawise-backend → ${version} (${changed} updated, ${alreadyOk} unchanged)`,
    )
}

const version = resolveVersion(process.argv.slice(2))
npmVersion(version)
setDesktopVersion(version)
setBackendVersions(version)
console.log(`[align-version] done → ${version}`)
