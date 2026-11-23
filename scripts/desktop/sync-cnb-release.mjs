#!/usr/bin/env node
/**
 * Upload local release assets to CNB Releases (mainland download mirror).
 *
 * Usage:
 *   set CNB_TOKEN=...
 *   set CNB_REPOSITORY=gouyehappy/datawise-pro
 *   node scripts/desktop/sync-cnb-release.mjs --github-release release.json --assets-dir DIR [--make-latest]
 *
 * Prefer the one-click wrapper: npm run mirror:cnb
 */
import {createReadStream, readdirSync, readFileSync, statSync} from 'node:fs'
import {basename, join} from 'node:path'
import {pathToFileURL} from 'node:url'

const DEFAULT_API_BASE = 'https://api.cnb.cool'
const DEFAULT_REPOSITORY = 'gouyehappy/datawise-pro'
const DEFAULT_CONCURRENCY = 3
const MAX_ATTEMPTS = 4

async function main() {
    const args = parseArgs(process.argv.slice(2))
    const githubRelease = JSON.parse(readFileSync(args.githubRelease, 'utf8'))
    const tag = githubRelease.tagName
    if (!tag) throw new Error('release JSON missing tagName')

    const client = new CnbClient({
        apiBase: process.env.CNB_API_BASE || DEFAULT_API_BASE,
        repository: args.repository,
        token: args.token,
    })
    const release = await client.ensureRelease(tag, githubRelease, {makeLatest: args.makeLatest})
    const mirrored = new Set((release.assets || []).map((asset) => asset.name))
    const local = localAssets(args.assetsDir)
    const missing = local.filter((path) => !mirrored.has(basename(path)))
    console.log(
        `[cnb] ${args.repository} ${tag}: ${mirrored.size} already there, ${missing.length} to upload`,
    )
    await mapWithConcurrency(missing, args.concurrency, (path) =>
        uploadWithRetry(client, release.id, path, args.overwrite),
    )
    console.log(`[cnb] done → https://cnb.cool/${args.repository}/-/releases/${encodeURIComponent(tag)}`)
}

function parseArgs(argv) {
    const args = {
        token: process.env.CNB_TOKEN || '',
        repository: process.env.CNB_REPOSITORY || DEFAULT_REPOSITORY,
        concurrency: Number.parseInt(process.env.CNB_UPLOAD_CONCURRENCY || `${DEFAULT_CONCURRENCY}`, 10),
        githubRelease: '',
        assetsDir: '',
        overwrite: false,
        makeLatest: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--github-release') args.githubRelease = argv[++i]
        else if (arg === '--assets-dir') args.assetsDir = argv[++i]
        else if (arg === '--repository') args.repository = argv[++i]
        else if (arg === '--overwrite-existing') args.overwrite = true
        else if (arg === '--make-latest') args.makeLatest = true
        else throw new Error(`unknown argument: ${arg}`)
    }
    if (!args.token) throw new Error('CNB_TOKEN is required (set env or pass via wrapper)')
    if (!args.repository || !/^[^/\s]+\/[^/\s]+$/.test(args.repository)) {
        throw new Error('CNB_REPOSITORY must look like owner/repo')
    }
    if (!args.githubRelease || !args.assetsDir) {
        throw new Error(
            'usage: sync-cnb-release.mjs --github-release release.json --assets-dir DIR [--make-latest]',
        )
    }
    if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
        throw new Error('CNB_UPLOAD_CONCURRENCY must be a positive integer')
    }
    return args
}

export class CnbClient {
    constructor({apiBase, repository, token}) {
        this.apiBase = apiBase.replace(/\/+$/, '')
        this.repository = repository
        this.token = token
    }

    async ensureRelease(tag, githubRelease, {makeLatest = false} = {}) {
        const metadata = {
            name: githubRelease.name || tag,
            body: githubRelease.body || '',
            prerelease: Boolean(githubRelease.isPrerelease),
            ...(makeLatest ? {make_latest: 'true'} : {}),
        }
        const existing = await this.request(
            'GET',
            `/${this.repository}/-/releases/tags/${encodeURIComponent(tag)}`,
            null,
            true,
        )
        if (!existing) {
            return this.request('POST', `/${this.repository}/-/releases`, {
                tag_name: tag,
                target_commitish: githubRelease.targetCommitish || '',
                ...metadata,
            })
        }
        await this.request('PATCH', `/${this.repository}/-/releases/${existing.id}`, metadata)
        return existing
    }

    async uploadAsset(releaseId, filePath, overwrite) {
        const size = statSync(filePath).size
        const target = await this.request('POST', `/${this.repository}/-/releases/${releaseId}/asset-upload-url`, {
            asset_name: basename(filePath),
            size,
            overwrite,
        })
        const upload = await fetch(target.upload_url, {
            method: 'PUT',
            headers: {'Content-Type': 'application/octet-stream', 'Content-Length': `${size}`},
            body: createReadStream(filePath),
            duplex: 'half',
        })
        if (!upload.ok) {
            throw new Error(`CNB object upload failed with ${upload.status}: ${await upload.text()}`)
        }
        const verify = await fetch(decodeURIComponent(target.verify_url), {
            method: 'POST',
            headers: this.headers(),
        })
        if (!verify.ok) {
            throw new Error(`CNB upload confirmation failed with ${verify.status}: ${await verify.text()}`)
        }
    }

    async request(method, path, body = null, allow404 = false) {
        const response = await fetch(`${this.apiBase}${path}`, {
            method,
            headers: this.headers(body !== null),
            body: body === null ? undefined : JSON.stringify(body),
        })
        if (allow404 && response.status === 404) return null
        if (!response.ok) {
            throw new Error(`CNB API ${method} ${path} failed with ${response.status}: ${await response.text()}`)
        }
        const text = await response.text()
        if (!text.trim()) return null
        return JSON.parse(text)
    }

    headers(json = false) {
        return {
            Accept: 'application/vnd.cnb.api+json',
            Authorization: `Bearer ${this.token}`,
            ...(json ? {'Content-Type': 'application/json'} : {}),
        }
    }
}

async function uploadWithRetry(client, releaseId, filePath, overwrite) {
    const name = basename(filePath)
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            console.log(`[cnb] ${name}: uploading (${attempt}/${MAX_ATTEMPTS})`)
            await client.uploadAsset(releaseId, filePath, overwrite)
            console.log(`[cnb] ${name}: ok`)
            return
        } catch (error) {
            if (attempt === MAX_ATTEMPTS) throw error
            const delay = 2 ** (attempt - 1) * 5000
            console.warn(`[cnb] ${name}: ${error.message}; retry in ${delay / 1000}s`)
            await new Promise((resolve) => setTimeout(resolve, delay))
        }
    }
}

function localAssets(dir) {
    return readdirSync(dir)
        .map((name) => join(dir, name))
        .filter((path) => statSync(path).isFile())
        .sort(
            (left, right) =>
                statSync(right).size - statSync(left).size || basename(left).localeCompare(basename(right)),
        )
}

async function mapWithConcurrency(items, concurrency, worker) {
    let next = 0
    async function run() {
        while (next < items.length) {
            const index = next++
            await worker(items[index])
        }
    }
    await Promise.all(Array.from({length: Math.min(concurrency, items.length || 1)}, run))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error.message || error)
        process.exitCode = 1
    })
}
