#!/usr/bin/env node
/**
 * Build Polaris Ops community plugin (.dwp).
 *
 *   node community-plugins/polaris-ops/package.mjs
 *   node community-plugins/polaris-ops/package.mjs --skip-backend
 *   node community-plugins/polaris-ops/package.mjs --skip-frontend
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'
import { platform, arch } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname)
const repoRoot = resolve(root, '../..')
const pluginId = 'io.datawise.community.polaris-ops'
const flags = new Set(process.argv.slice(2))
const skipBackend = flags.has('--skip-backend')
const skipFrontend = flags.has('--skip-frontend')

const osPart = platform() === 'win32' ? 'windows' : platform() === 'darwin' ? 'macos' : 'linux'
const archPart = arch() === 'arm64' ? 'arm64' : 'x86_64'
const target = `${osPart}-${archPart}`
const exeName = platform() === 'win32' ? 'datawise-plugin-polaris-ops.exe' : 'datawise-plugin-polaris-ops'
const staging = join(root, '.dwp-staging')
const distDir = join(root, 'dist')
const version = String(JSON.parse(readFileSync(join(root, 'manifest.datawise.json'), 'utf8')).version || '0.0.0')
const outDwp = join(distDir, `${pluginId}-${version}-${target}.dwp`)

function run(cmd, cmdArgs, cwd) {
  const result = spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function collectFiles(dir, base = dir, out = new Map()) {
  for (const name of readdirSync(dir)) {
    if (
      name === 'dist' ||
      name === 'node_modules' ||
      name === 'backend' ||
      name === 'frontend' ||
      name === 'tools' ||
      name === '.git' ||
      name === '.dwp-staging' ||
      name === '.signing' ||
      name.startsWith('.')
    ) {
      continue
    }
    if (
      name.endsWith('.mjs') ||
      name === 'README.md' ||
      name === 'PLUGIN_BRIEF.md' ||
      name === 'CHANGELOG.md' ||
      name === 'manifest.datawise.json' ||
      name === 'package-lock.json'
    ) {
      continue
    }
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) collectFiles(full, base, out)
    else out.set(relative(base, full).replace(/\\/g, '/'), readFileSync(full))
  }
  return out
}

function writeZip(filePath, entries) {
  const parts = []
  const central = []
  let offset = 0
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(data)
    const useDeflate = compressed.length < data.length
    const payload = useDeflate ? compressed : data
    const method = useDeflate ? 8 : 0
    const crc = crc32(data)
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc >>> 0, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    parts.push(local, payload)
    const cen = Buffer.alloc(46 + nameBuf.length)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(0, 8)
    cen.writeUInt16LE(method, 10)
    cen.writeUInt16LE(0, 12)
    cen.writeUInt16LE(0, 14)
    cen.writeUInt32LE(crc >>> 0, 16)
    cen.writeUInt32LE(payload.length, 20)
    cen.writeUInt32LE(data.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt16LE(0, 30)
    cen.writeUInt16LE(0, 32)
    cen.writeUInt16LE(0, 34)
    cen.writeUInt16LE(0, 36)
    cen.writeUInt32LE(0, 38)
    cen.writeUInt32LE(offset, 42)
    nameBuf.copy(cen, 46)
    central.push(cen)
    offset += local.length + payload.length
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.size, 8)
  end.writeUInt16LE(entries.size, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  writeFileSync(filePath, Buffer.concat([...parts, ...central, end]))
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c
}

if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })
mkdirSync(distDir, { recursive: true })

const manifest = JSON.parse(readFileSync(join(root, 'manifest.datawise.json'), 'utf8'))
manifest.entrypoints = manifest.entrypoints || {}
manifest.entrypoints.backend = { transport: 'stdio-jsonl', executable: `bin/${target}/${exeName}` }
manifest.entrypoints.ui = { root: 'ui', entry: 'ui/index.html' }
writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

const frontendDir = join(root, 'frontend')
const frontendDist = join(frontendDir, 'dist')
if (!skipFrontend) {
  console.log('-> Building React workbench (DATAWISE_INLINE + Monaco)…')
  if (!existsSync(join(frontendDir, 'node_modules'))) {
    run('npm', ['install'], frontendDir)
  }
  const prevInline = process.env.DATAWISE_INLINE
  process.env.DATAWISE_INLINE = '1'
  try {
    run('npm', ['run', 'build'], frontendDir)
  } finally {
    if (prevInline === undefined) delete process.env.DATAWISE_INLINE
    else process.env.DATAWISE_INLINE = prevInline
  }
}
if (!existsSync(join(frontendDist, 'index.html'))) {
  console.error('Missing frontend/dist/index.html — run frontend build first')
  process.exit(1)
}
const packedHtml = readFileSync(join(frontendDist, 'index.html'), 'utf8')
if (
  /<script\b[^>]*\bsrc=/i.test(packedHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))
  || !/DecompressionStream|createObjectURL/.test(packedHtml)
) {
  console.error('frontend/dist/index.html is not DataWise-inlined (need DATAWISE_INLINE=1 build).')
  process.exit(1)
}
// Keep ../ui for local verify-plugin / install convenience.
if (existsSync(join(root, 'ui'))) rmSync(join(root, 'ui'), { recursive: true, force: true })
cpSync(frontendDist, join(root, 'ui'), { recursive: true })
cpSync(frontendDist, join(staging, 'ui'), { recursive: true })
run(process.execPath, [join(repoRoot, 'community-plugins', 'scripts', 'assert-ui-inlined.mjs'), join(staging, 'ui')], root)

if (!skipBackend) {
  console.log('-> Building Go sidecar…')
  const backendDir = join(root, 'backend')
  const built = join(backendDir, exeName)
  run('go', ['build', '-o', built, '.'], backendDir)
  const binDir = join(staging, 'bin', target)
  mkdirSync(binDir, { recursive: true })
  copyFileSync(built, join(binDir, exeName))
} else {
  const built = join(root, 'backend', exeName)
  if (!existsSync(built)) {
    console.error('Missing backend binary:', built)
    process.exit(1)
  }
  const binDir = join(staging, 'bin', target)
  mkdirSync(binDir, { recursive: true })
  copyFileSync(built, join(binDir, exeName))
}

if (existsSync(join(root, 'assets'))) {
  cpSync(join(root, 'assets'), join(staging, 'assets'), { recursive: true })
}

console.log('-> Assembling unsigned .dwp…')
const files = collectFiles(staging)
const checksums = {}
for (const [name, data] of files) checksums[name] = sha256Hex(data)
const zipEntries = new Map([['checksums.json', Buffer.from(JSON.stringify(checksums, null, 2) + '\n', 'utf8')]])
for (const [name, data] of files) zipEntries.set(name, data)
if (existsSync(outDwp)) rmSync(outDwp)
writeZip(outDwp, zipEntries)
console.log('OK Package ready:', outDwp)
