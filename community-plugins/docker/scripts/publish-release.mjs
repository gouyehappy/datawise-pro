#!/usr/bin/env node
/**
 * Publish the Docker community plugin to a GitHub Release.
 *
 * Prerequisites:
 *   1. Signed package already built:
 *        node package.mjs --sign-key-file .signing/keys.json
 *   2. gh CLI authenticated with write access to the release repo
 *
 * Usage:
 *   node scripts/publish-release.mjs
 *   node scripts/publish-release.mjs --dry-run
 *   node scripts/publish-release.mjs --repo gouyehappy/datawise-cli
 *
 * Creates (or reuses) tag community-plugin-docker-v<version> and uploads
 * dist/*-signed.dwp so the built-in marketplace catalog URL resolves.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const distDir = join(root, 'dist')
const manifest = JSON.parse(readFileSync(join(root, 'manifest.datawise.json'), 'utf8'))
const version = String(manifest.version || '')
const pluginId = String(manifest.id || 'io.datawise.community.docker')
const tag = `community-plugin-docker-v${version}`

function parseArgs(argv) {
  const opts = { dryRun: false, repo: process.env.DATAWISE_GITHUB_REPO || 'gouyehappy/datawise-cli' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--repo' && argv[i + 1]) opts.repo = argv[++i]
    else if (arg === '--help' || arg === '-h') opts.help = true
    else {
      console.error('Unknown argument:', arg)
      process.exit(2)
    }
  }
  return opts
}

function run(cmd, args, { inherit = true } = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `exit ${result.status}`
    throw new Error(`${cmd} ${args.join(' ')} failed: ${detail}`)
  }
  return result
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

const opts = parseArgs(process.argv.slice(2))
if (opts.help) {
  console.log(`Usage: node scripts/publish-release.mjs [--dry-run] [--repo owner/name]

Builds are NOT run here. Sign first:

  npm run plugin:keygen -- datawise-community   # once; save to .signing/keys.json
  node package.mjs --sign-key-file .signing/keys.json
  node scripts/publish-release.mjs
`)
  process.exit(0)
}

if (!version) {
  console.error('manifest.datawise.json missing version')
  process.exit(1)
}

const signedAssets = existsSync(distDir)
  ? readdirSync(distDir).filter((name) => name.endsWith('-signed.dwp') && name.includes(`-${version}-`))
  : []

if (!signedAssets.length) {
  console.error(`No signed .dwp for ${pluginId}@${version} under dist/.`)
  console.error('Build one first:')
  console.error('  node package.mjs --sign-key-file .signing/keys.json')
  process.exit(1)
}

const assets = signedAssets.map((name) => {
  const path = join(distDir, name)
  return {
    name,
    path,
    size: statSync(path).size,
    sha256: sha256File(path),
  }
})

console.log(`Plugin:  ${pluginId} ${version}`)
console.log(`Repo:    ${opts.repo}`)
console.log(`Tag:     ${tag}`)
console.log('Assets:')
for (const asset of assets) {
  console.log(`  - ${asset.name}`)
  console.log(`    size=${asset.size} sha256=${asset.sha256}`)
}

if (opts.dryRun) {
  console.log('\nDry run only — no GitHub release created.')
  console.log(`Catalog packageUrl would be:`)
  for (const asset of assets) {
    console.log(`  https://github.com/${opts.repo}/releases/download/${tag}/${asset.name}`)
  }
  process.exit(0)
}

const view = spawnSync('gh', ['release', 'view', tag, '--repo', opts.repo], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
})
const exists = view.status === 0

if (!exists) {
  console.log(`Creating release ${tag}…`)
  run('gh', [
    'release',
    'create',
    tag,
    ...assets.map((a) => a.path),
    '--repo',
    opts.repo,
    '--title',
    `Community plugin Docker ${version}`,
    '--notes',
    [
      `Signed package for \`${pluginId}\` ${version}.`,
      '',
      'Install from DataWise Community plugins (requires trust key `datawise-community`),',
      'or download the `-signed.dwp` asset and install manually.',
    ].join('\n'),
  ])
} else {
  console.log(`Release ${tag} exists — uploading assets (clobber)…`)
  run('gh', [
    'release',
    'upload',
    tag,
    ...assets.map((a) => a.path),
    '--repo',
    opts.repo,
    '--clobber',
  ])
}

console.log('\nPublished. Next:')
console.log('  1. Ensure host trusts public key id=datawise-community')
console.log('  2. If catalog integrity fields are desired, rebuild catalog:')
console.log('       node community-plugins/scripts/generate-marketplace-catalog.mjs')
console.log('  3. Store install URL:')
for (const asset of assets) {
  console.log(`       https://github.com/${opts.repo}/releases/download/${tag}/${asset.name}`)
}
