#!/usr/bin/env node
/**
 * Build DataWise Log Controller community plugin (.dwp).
 *
 *   node community-plugins/log-controller/package.mjs
 *   node community-plugins/log-controller/package.mjs --skip-backend
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
const args = new Set(process.argv.slice(2))
const skipBackend = args.has('--skip-backend')

const osPart = platform() === 'win32' ? 'windows' : platform() === 'darwin' ? 'macos' : 'linux'
const archPart = arch() === 'arm64' ? 'arm64' : 'x86_64'
const target = `${osPart}-${archPart}`
const exeName =
  platform() === 'win32' ? 'datawise-plugin-log-controller.exe' : 'datawise-plugin-log-controller'
const staging = join(root, '.dwp-staging')
const distDir = join(root, 'dist')
const version = String(
  JSON.parse(readFileSync(join(root, 'manifest.datawise.json'), 'utf8')).version || '0.0.0',
)
const outDwp = join(distDir, `io.datawise.community.log-controller-${version}-${target}.dwp`)

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
      name === 'shared' ||
      name === '.git' ||
      name === '.github' ||
      name === '.dwp-staging' ||
      name.startsWith('.')
    ) {
      continue
    }
    if (name.endsWith('.mjs') || name === 'README.md' || name === 'manifest.datawise.json') {
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

function candidateReleaseBinaries() {
  const targetRoot = join(root, 'backend', 'target')
  const names = []
  const hostPath = join(targetRoot, 'release', exeName)
  if (existsSync(hostPath)) names.push(hostPath)
  if (!existsSync(targetRoot)) return names
  for (const triple of readdirSync(targetRoot)) {
    const candidate = join(targetRoot, triple, 'release', exeName)
    if (existsSync(candidate)) names.push(candidate)
  }
  return names
}

function resolveReleaseBinary() {
  const candidates = candidateReleaseBinaries()
  if (candidates.length === 0) return null
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return candidates[0]
}

if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })
mkdirSync(distDir, { recursive: true })

const manifestSrc = join(root, 'manifest.datawise.json')
const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'))
manifest.entrypoints = manifest.entrypoints || {}
manifest.entrypoints.backend = {
  transport: 'stdio-framed',
  executable: `bin/${target}/${exeName}`,
}
writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

if (!skipBackend) {
  console.log('-> Building Rust sidecar...')
  run('cargo', ['build', '--release', '--manifest-path', join(root, 'backend', 'Cargo.toml')], root)
}

const built = resolveReleaseBinary()
if (!built) {
  console.error('Missing release binary under backend/target/**/release/', exeName)
  process.exit(1)
}
console.log('-> Using sidecar:', built)
{
  const binDir = join(staging, 'bin', target)
  mkdirSync(binDir, { recursive: true })
  copyFileSync(built, join(binDir, exeName))
}

if (existsSync(join(root, 'ui'))) {
  cpSync(join(root, 'ui'), join(staging, 'ui'), { recursive: true })
  // Opaque-origin workbench iframes cannot load ./app.js — inline into index.html.
  run(process.execPath, [join(repoRoot, 'community-plugins', 'scripts', 'inline-static-ui.mjs'), join(staging, 'ui')], root)
  run(process.execPath, [join(repoRoot, 'community-plugins', 'scripts', 'assert-ui-inlined.mjs'), join(staging, 'ui')], root)
}
if (existsSync(join(root, 'assets'))) {
  cpSync(join(root, 'assets'), join(staging, 'assets'), { recursive: true })
}
if (existsSync(join(root, 'LICENSE'))) {
  copyFileSync(join(root, 'LICENSE'), join(staging, 'LICENSE'))
}

console.log('-> Assembling unsigned .dwp...')
const files = collectFiles(staging)
const checksums = {}
for (const [name, data] of files) {
  checksums[name] = sha256Hex(data)
}
const checksumsRaw = Buffer.from(JSON.stringify(checksums, null, 2) + '\n', 'utf8')
const zipEntries = new Map([['checksums.json', checksumsRaw]])
for (const [name, data] of files) {
  zipEntries.set(name, data)
}
if (existsSync(outDwp)) rmSync(outDwp)
writeZip(outDwp, zipEntries)
console.log('OK Package ready:', outDwp)
console.log('  DataWise -> Community plugins -> allow unsigned -> install the path above')
