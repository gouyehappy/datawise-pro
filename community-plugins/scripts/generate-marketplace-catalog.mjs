#!/usr/bin/env node
/**
 * Generate the built-in community plugin marketplace catalog from plugin manifests.
 *
 * Usage:
 *   node community-plugins/scripts/generate-marketplace-catalog.mjs
 *   node community-plugins/scripts/generate-marketplace-catalog.mjs --check
 *
 * Hello stays on classpath fixture; other plugins use GitHub Release HTTPS packageUrl
 * (signed .dwp). Does not embed .dwp binaries into the server jar.
 */
import {createHash} from 'node:crypto'
import {readdirSync, readFileSync, writeFileSync, existsSync, statSync} from 'node:fs'
import {dirname, join, basename} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pluginsRoot = join(__dirname, '..')
const repoRoot = join(pluginsRoot, '..')
const catalogPath = join(
  repoRoot,
  'datawise-backend/datawise-server/src/main/resources/community-plugin-catalog.json',
)

import {resolveRepoIdentity} from '../../scripts/repo-identity.mjs'

/** GitHub owner/repo that hosts community-plugin-* release assets. */
const RELEASE_REPO =
    resolveRepoIdentity({required: false})?.slug || 'gouyehappy/datawise-cli'
const COMMUNITY_SIGNING_KEY_ID = 'datawise-community'
const SKIP_DIRS = new Set(['docs', 'scripts', 'shared', 'examples'])

const checkOnly = process.argv.includes('--check')

function parseJsonLoose(text) {
  let s = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  s = s.replace(/,\s*([}\]])/g, '$1')
  return JSON.parse(s)
}

function loadManifest(dir) {
  for (const name of ['manifest.datawise.json', 'manifest.json']) {
    const p = join(dir, name)
    if (existsSync(p)) {
      return {path: p, data: parseJsonLoose(readFileSync(p, 'utf8'))}
    }
  }
  return null
}

function listDwpArtifacts(dir) {
  const dist = join(dir, 'dist')
  if (!existsSync(dist)) return []
  return readdirSync(dist)
    .filter((f) => f.endsWith('.dwp') && !f.includes('-signed'))
    .map((f) => ({name: f, mtime: statSync(join(dist, f)).mtimeMs}))
}

/** Prefer windows-x86_64 for the current version; else any matching version; else newest. */
function pickArtifact(artifacts, version) {
  if (!artifacts.length) return null
  const ver = String(version || '')
  const matching = artifacts.filter((a) => a.name.includes(`-${ver}`) || a.name.includes(`-${ver}-`))
  const pool = matching.length ? matching : artifacts
  const win = pool.find((a) => a.name.includes('-windows-x86_64.dwp'))
  if (win) return win.name
  return pool.slice().sort((a, b) => b.mtime - a.mtime)[0].name
}

function signedArtifactName(unsignedName) {
  if (!unsignedName || !unsignedName.endsWith('.dwp')) {
    throw new Error(`Invalid artifact name: ${unsignedName}`)
  }
  if (unsignedName.endsWith('-signed.dwp')) return unsignedName
  return unsignedName.replace(/\.dwp$/, '-signed.dwp')
}

function fileIntegrity(filePath) {
  const buf = readFileSync(filePath)
  return {
    packageSha256: createHash('sha256').update(buf).digest('hex'),
    packageSizeBytes: buf.length,
  }
}

/**
 * Prefer hashing the signed release asset when present under dist/;
 * otherwise omit integrity fields (unsigned local build ≠ signed download).
 */
function packageIntegrityFromDist(pluginDir, unsignedArtifact) {
  if (!unsignedArtifact) return {}
  const signedName = signedArtifactName(unsignedArtifact)
  const signedPath = join(pluginDir, 'dist', signedName)
  if (existsSync(signedPath) && statSync(signedPath).isFile()) {
    return fileIntegrity(signedPath)
  }
  return {}
}

function releasePackageUrl(pluginDirName, version, unsignedArtifact) {
  const tag = `community-plugin-${pluginDirName}-v${version}`
  const asset = signedArtifactName(unsignedArtifact)
  return `https://github.com/${RELEASE_REPO}/releases/download/${tag}/${asset}`
}

function communityEntry(pluginDirName, manifest, unsignedArtifact, previousByKey) {
  const {id, name, version, publisher, description, permissions} = manifest
  if (!id || !name || !version || !publisher || !permissions) {
    throw new Error(`Incomplete manifest in ${pluginDirName}`)
  }
  if (!unsignedArtifact) {
    throw new Error(
      `No dist/*.dwp for ${pluginDirName} (id=${id}). Build the plugin before generating the catalog.`,
    )
  }
  const packageUrl = releasePackageUrl(pluginDirName, version, unsignedArtifact)
  const entry = {
    id,
    name,
    version,
    publisher,
    description: description || name,
    packageUrl,
    signingKeyId: COMMUNITY_SIGNING_KEY_ID,
    permissions: [...permissions],
  }
  const integrity = packageIntegrityFromDist(join(pluginsRoot, pluginDirName), unsignedArtifact)
  Object.assign(entry, integrity)
  return preserveIntegrity(entry, previousByKey)
}

function previousIndex(prevCatalog) {
  const map = new Map()
  if (!prevCatalog?.catalogs) return map
  for (const catalog of prevCatalog.catalogs) {
    for (const entry of catalog.entries || []) {
      if (!entry?.id || !entry?.version || !entry?.packageUrl) continue
      map.set(`${entry.id}@${entry.version}|${entry.packageUrl}`, entry)
    }
  }
  return map
}

/** Keep prior packageSha256/size when local signed artifact is absent but URL unchanged. */
function preserveIntegrity(entry, previousByKey) {
  if (entry.packageSha256) return entry
  const prev = previousByKey.get(`${entry.id}@${entry.version}|${entry.packageUrl}`)
  if (prev?.packageSha256) {
    entry.packageSha256 = prev.packageSha256
    if (prev.packageSizeBytes != null) entry.packageSizeBytes = prev.packageSizeBytes
  }
  return entry
}

function helloEntry(previousByKey) {
  const helloDir = join(pluginsRoot, 'examples', 'hello-workbench')
  const mf = loadManifest(helloDir)
  if (!mf) throw new Error('hello-workbench manifest missing')
  const m = mf.data
  const packageUrl = `classpath:community-plugin-fixtures/${m.id}-${m.version}.dwp`
  const fixturePath = join(
    repoRoot,
    'datawise-backend/datawise-server/src/main/resources/community-plugin-fixtures',
    `${m.id}-${m.version}.dwp`,
  )
  const entry = {
    id: m.id,
    name: m.name,
    version: m.version,
    publisher: m.publisher,
    description: m.description || m.name,
    packageUrl,
    signingKeyId: 'datawise-examples',
    permissions: [...(m.permissions || [])],
  }
  if (existsSync(fixturePath)) {
    Object.assign(entry, fileIntegrity(fixturePath))
  }
  return preserveIntegrity(entry, previousByKey)
}

function collectCommunityEntries(previousByKey) {
  const dirs = readdirSync(pluginsRoot, {withFileTypes: true})
    .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name) && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort()

  const entries = []
  for (const name of dirs) {
    const dir = join(pluginsRoot, name)
    const mf = loadManifest(dir)
    if (!mf) {
      console.warn(`skip ${name}: no manifest`)
      continue
    }
    const artifact = pickArtifact(listDwpArtifacts(dir), mf.data.version)
    entries.push(communityEntry(name, mf.data, artifact, previousByKey))
  }
  return entries
}

function buildCatalog(previousByKey) {
  return {
    catalogs: [
      {
        id: 'datawise-examples',
        name: 'DataWise Examples',
        entries: [helloEntry(previousByKey)],
      },
      {
        id: 'datawise-community',
        name: 'DataWise Community',
        entries: collectCommunityEntries(previousByKey),
      },
    ],
  }
}

function stableStringify(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`
}

const prevText = existsSync(catalogPath) ? readFileSync(catalogPath, 'utf8') : ''
let previousByKey = new Map()
if (prevText) {
  try {
    previousByKey = previousIndex(JSON.parse(prevText))
  } catch {
    previousByKey = new Map()
  }
}

const catalog = buildCatalog(previousByKey)
const next = stableStringify(catalog)

if (checkOnly) {
  if (prevText !== next) {
    console.error(`✗ ${catalogPath} is out of date. Run:`)
    console.error('  node community-plugins/scripts/generate-marketplace-catalog.mjs')
    process.exit(1)
  }
  console.log(`✓ ${basename(catalogPath)} is up to date (${catalog.catalogs[1].entries.length} community + hello)`)
  process.exit(0)
}

writeFileSync(catalogPath, next)
console.log(`✓ Wrote ${catalogPath}`)
console.log(`  examples: ${catalog.catalogs[0].entries.length}`)
console.log(`  community: ${catalog.catalogs[1].entries.length}`)
let withIntegrity = 0
for (const e of catalog.catalogs.flatMap((c) => c.entries)) {
  if (e.packageSha256) withIntegrity++
}
console.log(`  integrity receipts: ${withIntegrity}`)
for (const e of catalog.catalogs[1].entries) {
  const mark = e.packageSha256 ? ` sha256=${e.packageSha256.slice(0, 8)}…` : ''
  console.log(`  - ${e.id}@${e.version}${mark}`)
}
