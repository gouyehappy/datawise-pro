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

function releasePackageUrl(pluginDirName, version, unsignedArtifact) {
  const tag = `community-plugin-${pluginDirName}-v${version}`
  const asset = signedArtifactName(unsignedArtifact)
  return `https://github.com/${RELEASE_REPO}/releases/download/${tag}/${asset}`
}

function communityEntry(pluginDirName, manifest, unsignedArtifact) {
  const {id, name, version, publisher, description, permissions} = manifest
  if (!id || !name || !version || !publisher || !permissions) {
    throw new Error(`Incomplete manifest in ${pluginDirName}`)
  }
  if (!unsignedArtifact) {
    throw new Error(
      `No dist/*.dwp for ${pluginDirName} (id=${id}). Build the plugin before generating the catalog.`,
    )
  }
  return {
    id,
    name,
    version,
    publisher,
    description: description || name,
    packageUrl: releasePackageUrl(pluginDirName, version, unsignedArtifact),
    signingKeyId: COMMUNITY_SIGNING_KEY_ID,
    permissions: [...permissions],
  }
}

function helloEntry() {
  const helloDir = join(pluginsRoot, 'examples', 'hello-workbench')
  const mf = loadManifest(helloDir)
  if (!mf) throw new Error('hello-workbench manifest missing')
  const m = mf.data
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    publisher: m.publisher,
    description: m.description || m.name,
    packageUrl: `classpath:community-plugin-fixtures/${m.id}-${m.version}.dwp`,
    signingKeyId: 'datawise-examples',
    permissions: [...(m.permissions || [])],
  }
}

function collectCommunityEntries() {
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
    entries.push(communityEntry(name, mf.data, artifact))
  }
  return entries
}

function buildCatalog() {
  return {
    catalogs: [
      {
        id: 'datawise-examples',
        name: 'DataWise Examples',
        entries: [helloEntry()],
      },
      {
        id: 'datawise-community',
        name: 'DataWise Community',
        entries: collectCommunityEntries(),
      },
    ],
  }
}

function stableStringify(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`
}

const catalog = buildCatalog()
const next = stableStringify(catalog)
const prev = existsSync(catalogPath) ? readFileSync(catalogPath, 'utf8') : ''

if (checkOnly) {
  if (prev !== next) {
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
for (const e of catalog.catalogs[1].entries) {
  console.log(`  - ${e.id}@${e.version}`)
}
