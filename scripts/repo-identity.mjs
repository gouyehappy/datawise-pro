/**
 * Resolve GitHub owner/repo for releases, updater, and catalog download URLs.
 *
 * Priority:
 *   1. DATAWISE_GITHUB_REPO=owner/name
 *   2. GITHUB_REPOSITORY (Actions)
 *   3. repo.meta.json next to repo root (copy from repo.meta.example.json)
 *   4. Built-in default: gouyehappy/datawise-cli (keeps installed clients on the same update channel)
 */
import {existsSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Canonical release / updater channel for this product line. */
export const DEFAULT_GITHUB_SLUG = 'gouyehappy/datawise-cli'

function parseSlug(raw) {
    const text = String(raw || '').trim()
    const m = text.match(/^([^/\s]+)\/([^/\s]+)$/)
    if (!m) return null
    return {owner: m[1], repo: m[2], slug: `${m[1]}/${m[2]}`}
}

export function resolveRepoIdentity(options = {}) {
    const required = options.required === true
    const allowDefault = options.allowDefault !== false

    const fromEnv =
        parseSlug(process.env.DATAWISE_GITHUB_REPO) ||
        parseSlug(process.env.GITHUB_REPOSITORY)
    if (fromEnv) return fromEnv

    const metaPath = join(root, 'repo.meta.json')
    if (existsSync(metaPath)) {
        try {
            const json = JSON.parse(readFileSync(metaPath, 'utf8'))
            const parsed = parseSlug(`${json.githubOwner}/${json.githubRepo}`)
            if (parsed && !parsed.owner.includes('YOUR_')) return parsed
        } catch {
            // ignore
        }
    }

    if (allowDefault) {
        return parseSlug(DEFAULT_GITHUB_SLUG)
    }

    if (required) {
        throw new Error(
            'GitHub repo identity missing. Set DATAWISE_GITHUB_REPO=owner/name ' +
                'or copy repo.meta.example.json → repo.meta.json and fill owner/repo.',
        )
    }
    return null
}

export function githubHttps(identity) {
    const id = identity || resolveRepoIdentity()
    if (!id) return null
    return {
        repo: `https://github.com/${id.slug}`,
        releases: `https://github.com/${id.slug}/releases`,
        releasesLatest: `https://github.com/${id.slug}/releases/latest`,
        apiLatest: `https://api.github.com/repos/${id.slug}/releases/latest`,
        apiReleases: `https://api.github.com/repos/${id.slug}/releases`,
        pagesDocs: `https://${id.owner}.github.io/${id.repo}/docs/`,
        pagesHome: `https://${id.owner}.github.io/${id.repo}/`,
        downloadBase: (tag) =>
            `https://github.com/${id.slug}/releases/download/${tag}/`,
        releaseDownloadBase: (version) => {
            const tag = String(version || '').startsWith('v') ? version : `v${version}`
            return `https://github.com/${id.slug}/releases/download/${tag}/`
        },
    }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('repo-identity.mjs')) {
    const id = resolveRepoIdentity({required: false})
    console.log(id ? JSON.stringify(id, null, 2) : 'unconfigured')
}
