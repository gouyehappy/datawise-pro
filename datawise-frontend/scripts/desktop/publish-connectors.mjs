/**
 * Publish connector JARs + runtime-catalog.json to a GitHub Release (D-03).
 *
 * Usage:
 *   node scripts/desktop/publish-connectors.mjs [--tag v4.1.6] [--plugins-dir path]
 *
 * Requires GH_TOKEN or GITHUB_TOKEN. Uploads assets under:
 *   connectors/<jar-name>
 *   runtime-catalog.json
 */
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {repoConfig, repoRoot} from './paths.mjs'
import {isDirectRun, log} from './lib.mjs'
import {generateRuntimeCatalog} from './generate-runtime-catalog.mjs'
import {resolveRepoIdentity} from '../../../scripts/repo-identity.mjs'

function parseArgs(argv) {
    let tag = null
    let pluginsDir = join(repoConfig, 'plugins')
    const tagIdx = argv.indexOf('--tag')
    if (tagIdx >= 0 && argv[tagIdx + 1]) tag = argv[tagIdx + 1]
    const pluginsIdx = argv.indexOf('--plugins-dir')
    if (pluginsIdx >= 0 && argv[pluginsIdx + 1]) pluginsDir = argv[pluginsIdx + 1]
    return {tag, pluginsDir}
}

function readPackageVersion() {
    try {
        const pkg = JSON.parse(
            readFileSync(join(repoRoot, 'datawise-frontend', 'package.json'), 'utf8'),
        )
        return pkg.version ?? '0.0.0'
    } catch {
        return '0.0.0'
    }
}

function curlBin() {
    return process.platform === 'win32' ? 'curl.exe' : 'curl'
}

function ghApi(method, url, token, bodyPath) {
    const args = [
        '-sS',
        '-X', method,
        '-H', `Authorization: Bearer ${token}`,
        '-H', 'Accept: application/vnd.github+json',
        '-H', 'X-GitHub-Api-Version: 2022-11-28',
    ]
    if (bodyPath) {
        args.push('-H', 'Content-Type: application/json', '--data-binary', `@${bodyPath}`)
    }
    args.push(url)
    const result = spawnSync(curlBin(), args, {encoding: 'utf8', shell: false, windowsHide: true})
    if (result.status !== 0) {
        throw new Error(result.stderr || `curl failed: ${result.status}`)
    }
    return result.stdout ? JSON.parse(result.stdout) : null
}

function uploadAsset(uploadUrlTemplate, token, filePath, assetName) {
    const base = uploadUrlTemplate.split('{')[0]
    const url = `${base}?name=${encodeURIComponent(assetName)}`
    const result = spawnSync(
        curlBin(),
        [
            '-sS',
            '-X', 'POST',
            '-H', `Authorization: Bearer ${token}`,
            '-H', 'Accept: application/vnd.github+json',
            '-H', 'Content-Type: application/octet-stream',
            '--data-binary', `@${filePath}`,
            url,
        ],
        {encoding: 'utf8', shell: false, windowsHide: true},
    )
    if (result.status !== 0) {
        throw new Error(result.stderr || `upload failed for ${assetName}`)
    }
}

export async function publishConnectors(options = {}) {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
    if (!token) {
        throw new Error('GH_TOKEN or GITHUB_TOKEN required')
    }
    const version = options.tag
        ? String(options.tag).replace(/^v/, '')
        : readPackageVersion()
    const tag = `v${version}`
    const pluginsDir = options.pluginsDir || join(repoConfig, 'plugins')
    if (!existsSync(pluginsDir)) {
        throw new Error(`plugins dir missing: ${pluginsDir}`)
    }

    const staging = join(repoRoot, 'datawise-frontend', 'release', 'connectors-publish')
    mkdirSync(staging, {recursive: true})
    const catalogPath = join(staging, 'runtime-catalog.json')
    await generateRuntimeCatalog({
        pluginsDir,
        out: catalogPath,
        releaseTag: version,
    })

    const jars = readdirSync(pluginsDir).filter((name) => name.endsWith('.jar'))
    if (!jars.length) {
        throw new Error(`no connector JARs in ${pluginsDir}`)
    }

    const identity = resolveRepoIdentity({required: true})
    let release = null
    try {
        release = ghApi(
            'GET',
            `https://api.github.com/repos/${identity.slug}/releases/tags/${tag}`,
            token,
        )
    } catch {
        release = null
    }
    if (!release?.upload_url) {
        const createBody = join(staging, 'create-release.json')
        writeFileSync(
            createBody,
            JSON.stringify({
                tag_name: tag,
                name: tag,
                body: `Connector / runtime-catalog assets for ${tag} (D-03).`,
                draft: false,
                prerelease: false,
            }),
            'utf8',
        )
        release = ghApi(
            'POST',
            `https://api.github.com/repos/${identity.slug}/releases`,
            token,
            createBody,
        )
    }
    if (!release?.upload_url) {
        throw new Error(`could not resolve GitHub release for ${tag}`)
    }

    uploadAsset(release.upload_url, token, catalogPath, 'runtime-catalog.json')
    for (const jar of jars) {
        const src = join(pluginsDir, jar)
        uploadAsset(release.upload_url, token, src, jar)
        log('publish-connectors', `uploaded ${jar}`)
    }

    log('publish-connectors', `published ${jars.length} jar(s) + runtime-catalog.json → ${tag}`)
    return {tag, jars: jars.length, catalogPath}
}

async function main() {
    const {tag, pluginsDir} = parseArgs(process.argv.slice(2))
    await publishConnectors({tag, pluginsDir})
}

if (isDirectRun(import.meta.url)) {
    main().catch((err) => {
        console.error('[publish-connectors]', err instanceof Error ? err.message : err)
        process.exit(1)
    })
}

void fileURLToPath
