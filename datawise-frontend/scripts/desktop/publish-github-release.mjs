/**
 * Upload desktop release artifacts to GitHub Releases (retry helper).
 *
 * Usage (GH_TOKEN required):
 *   node scripts/desktop/publish-github-release.mjs [--tag v4.1.7]
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {frontendRoot} from './paths.mjs'
import {resolveRepoIdentity} from '../../../scripts/repo-identity.mjs'

const identity = resolveRepoIdentity({required: true})
const owner = identity.owner
const repo = identity.repo
const tag = process.argv.includes('--tag')
    ? process.argv[process.argv.indexOf('--tag') + 1]
    : 'v5.0.0'
const releaseIdArg = process.argv.includes('--release-id')
    ? Number(process.argv[process.argv.indexOf('--release-id') + 1])
    : null
const releaseDir = path.join(frontendRoot, 'release')

function resolveGhToken() {
    if (process.env.GH_TOKEN?.trim()) return process.env.GH_TOKEN.trim()
    if (process.env.GITHUB_TOKEN?.trim()) return process.env.GITHUB_TOKEN.trim()
    const result = spawnSync('git', ['credential', 'fill'], {
        input: 'protocol=https\nhost=github.com\n\n',
        encoding: 'utf8',
    })
    if (result.status !== 0) return ''
    for (const line of result.stdout.split('\n')) {
        if (line.startsWith('password=')) {
            return line.slice('password='.length).trim()
        }
    }
    return ''
}

function sha512Base64(filePath) {
    const buf = fs.readFileSync(filePath)
    return crypto.createHash('sha512').update(buf).digest('base64')
}

function writeLatestYml(setupPath, remoteName) {
    const sha512 = sha512Base64(setupPath)
    const size = fs.statSync(setupPath).size
    const version = tag.replace(/^v/, '')
    const yml = [
        `version: ${version}`,
        'files:',
        `  - url: ${remoteName}`,
        `    sha512: ${sha512}`,
        `    size: ${size}`,
        `path: ${remoteName}`,
        `sha512: ${sha512}`,
        `releaseDate: '${new Date().toISOString()}'`,
        '',
    ].join('\n')
    fs.writeFileSync(path.join(releaseDir, 'latest.yml'), yml, 'utf8')
    console.log(`[publish] wrote latest.yml for ${version}`)
}

async function ghJson(method, url, body) {
    const token = resolveGhToken()
    if (!token) {
        throw new Error('GH_TOKEN / git credential password not found')
    }
    const args = [
        '--fail', '--silent', '--show-error', '--http1.1',
        '-m', '120',
        '-H', `Authorization: Bearer ${token}`,
        '-H', 'Accept: application/vnd.github+json',
        '-H', 'X-GitHub-Api-Version: 2022-11-28',
        '-X', method,
        url,
    ]
    if (body) {
        args.splice(args.length - 1, 0, '-H', 'Content-Type: application/json', '-d', JSON.stringify(body))
    }
    const result = spawnSync('curl.exe', args, {encoding: 'utf8'})
    if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || '').trim()
        throw new Error(`${method} ${url} → curl ${result.status}: ${detail.slice(0, 400)}`)
    }
    return result.stdout ? JSON.parse(result.stdout) : null
}

async function uploadAsset(releaseId, remoteName, localPath) {
    const token = resolveGhToken()
    const url = `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(remoteName)}`
    const size = fs.statSync(localPath).size
    console.log(`[publish] uploading ${remoteName} (${size} bytes) via curl…`)

    const args = [
        '--fail', '--show-error', '--http1.1',
        '--max-time', '7200',
        '--retry', '3', '--retry-all-errors', '--retry-delay', '5',
        '-X', 'POST',
        '-H', `Authorization: Bearer ${token}`,
        '-H', 'Content-Type: application/octet-stream',
        '--data-binary', `@${localPath}`,
        url,
    ]
    const result = spawnSync('curl.exe', args, {stdio: 'inherit'})
    if (result.status !== 0) {
        throw new Error(`upload ${remoteName} failed (curl exit ${result.status ?? 'unknown'})`)
    }
    console.log(`[publish] uploaded ${remoteName}`)
}

async function ensureRelease() {
    try {
        return await ghJson('GET', `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('404')) throw error
    }
    console.log(`[publish] creating GitHub Release ${tag}…`)
    return ghJson('POST', `https://api.github.com/repos/${owner}/${repo}/releases`, {
        tag_name: tag,
        name: `DataWise ${tag}`,
        body: [
            'Production hardening milestone with desktop auto-update fix (generic latest.yml feed).',
            '',
            'Assets: NSIS installer, portable exe, latest.yml.',
        ].join('\n'),
        draft: false,
        prerelease: false,
    })
}

function assertFile(name) {
    const full = path.join(releaseDir, name)
    if (!fs.existsSync(full)) {
        throw new Error(`Missing artifact: ${full}`)
    }
    return full
}

async function main() {
    const setupLocal = assertFile('DataWiseCLI Setup 4.1.7.exe')
    const blockmapLocal = assertFile('DataWiseCLI Setup 4.1.7.exe.blockmap')
    const portableLocal = assertFile('DataWiseCLI 4.1.7.exe')

    writeLatestYml(setupLocal, 'DataWiseCLI-Setup-4.1.7.exe')
    const latestLocal = path.join(releaseDir, 'latest.yml')

    const release = releaseIdArg
        ? {id: releaseIdArg, assets: []}
        : await ensureRelease()
    if (releaseIdArg) {
        try {
            const fetched = await ghJson('GET', `https://api.github.com/repos/${owner}/${repo}/releases/${releaseIdArg}`)
            release.assets = fetched.assets ?? []
        } catch {
            release.assets = []
        }
    }
    const existing = new Set((release.assets ?? []).map((asset) => asset.name))

    const uploads = [
        ['latest.yml', latestLocal],
        ['DataWiseCLI-Setup-4.1.7.exe.blockmap', blockmapLocal],
        ['DataWiseCLI-4.1.7.exe', portableLocal],
        ['DataWiseCLI-Setup-4.1.7.exe', setupLocal],
    ]

    for (const [remoteName, localPath] of uploads) {
        if (existing.has(remoteName)) {
            console.log(`[publish] skip existing asset ${remoteName}`)
            continue
        }
        await uploadAsset(release.id, remoteName, localPath)
    }

    console.log(`[publish] done → https://github.com/${owner}/${repo}/releases/tag/${tag}`)
}

await main()
