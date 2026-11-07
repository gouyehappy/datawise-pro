/**
 * Ensure JetBrains JCEF is in the local Maven repo.
 * Corporate mirrors often redirect every repository id (including JetBrains) to
 * Aliyun/Nexus, which does not host this artifact — so we download + install-file.
 */
import {spawnSync} from 'node:child_process'
import {cpSync, existsSync, mkdirSync, writeFileSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {log, run} from './lib.mjs'

export const JCEF_GROUP = 'org.jetbrains.intellij.deps.jcef'
export const JCEF_ARTIFACT = 'jcef'
export const JCEF_VERSION = '122.1.9-gd14e051-chromium-122.0.6261.94-api-1.14'
const JCEF_BASE =
    'https://packages.jetbrains.team/maven/p/ij/intellij-dependencies/org/jetbrains/intellij/deps/jcef/jcef'

const scriptDir = join(fileURLToPath(import.meta.url), '..')
const repoRoot = join(scriptDir, '..', '..', '..')

function curlBin() {
    return process.platform === 'win32' ? 'curl.exe' : 'curl'
}

function localRepoRoot() {
    const r = spawnSync(
        process.platform === 'win32' ? 'mvn.cmd' : 'mvn',
        ['-q', 'help:evaluate', '-Dexpression=settings.localRepository', '-DforceStdout'],
        {encoding: 'utf8', shell: false},
    )
    const out = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop()
    if (r.status === 0 && out && existsSync(out)) {
        return out
    }
    return join(process.env.USERPROFILE || process.env.HOME || '', '.m2', 'repository')
}

function download(url, dest) {
    const curl = spawnSync(
        curlBin(),
        ['--fail', '--location', '--retry', '3', '--output', dest, url],
        {stdio: 'inherit', shell: false},
    )
    if (curl.status !== 0) {
        throw new Error(`download failed (${curl.status}): ${url}`)
    }
}

function writeMinimalPom(path) {
    writeFileSync(
        path,
        `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>${JCEF_GROUP}</groupId>
  <artifactId>${JCEF_ARTIFACT}</artifactId>
  <version>${JCEF_VERSION}</version>
</project>
`,
        'utf8',
    )
}

/**
 * Download (if needed) and {@code mvn install:install-file} JetBrains JCEF.
 */
export function ensureJetbrainsJcefMavenArtifact() {
    const cache = join(repoRoot, 'datawise-desktop', 'target', 'jcef-maven-cache')
    mkdirSync(cache, {recursive: true})
    const cachedJar = join(cache, `${JCEF_ARTIFACT}-${JCEF_VERSION}.jar`)
    const cachedPom = join(cache, `${JCEF_ARTIFACT}-${JCEF_VERSION}.pom`)

    const desktopLibJar = join(
        repoRoot,
        'datawise-desktop',
        'target',
        'lib',
        `${JCEF_ARTIFACT}-${JCEF_VERSION}.jar`,
    )

    if (!existsSync(cachedJar) || statSync(cachedJar).size < 100_000) {
        if (existsSync(desktopLibJar) && statSync(desktopLibJar).size > 100_000) {
            cpSync(desktopLibJar, cachedJar)
            log('maven', 'copied JCEF jar from datawise-desktop/target/lib')
        } else {
            log('maven', `downloading JetBrains JCEF ${JCEF_VERSION}…`)
            download(`${JCEF_BASE}/${JCEF_VERSION}/${JCEF_ARTIFACT}-${JCEF_VERSION}.jar`, cachedJar)
        }
    }

    if (!existsSync(cachedPom) || statSync(cachedPom).size < 50) {
        try {
            download(`${JCEF_BASE}/${JCEF_VERSION}/${JCEF_ARTIFACT}-${JCEF_VERSION}.pom`, cachedPom)
        } catch {
            writeMinimalPom(cachedPom)
        }
    }

    run(
        'mvn',
        [
            '-q',
            'install:install-file',
            `-Dfile=${cachedJar}`,
            `-DpomFile=${cachedPom}`,
            `-DgroupId=${JCEF_GROUP}`,
            `-DartifactId=${JCEF_ARTIFACT}`,
            `-Dversion=${JCEF_VERSION}`,
            '-Dpackaging=jar',
        ],
        repoRoot,
    )
    log(
        'maven',
        `installed ${JCEF_GROUP}:${JCEF_ARTIFACT}:${JCEF_VERSION} → ${localRepoRoot()}`,
    )
}
