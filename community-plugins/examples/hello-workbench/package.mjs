#!/usr/bin/env node
/**
 * Build hello-workbench sidecar jar + unsigned .dwp (Node zip + checksums, matches DwpCodec).
 *
 *   node community-plugins/examples/hello-workbench/package.mjs
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  createWriteStream,
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname)
const sidecarDir = join(root, 'sidecar')
const stagingBin = join(root, 'bin')
const distDir = join(root, 'dist')
const jarName = 'hello-plugin.jar'
const outDwp = join(distDir, 'io.datawise.example.hello-1.0.0.dwp')

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function collectFiles(dir, base = dir, out = new Map()) {
  for (const name of readdirSync(dir)) {
    if (name === 'sidecar' || name === 'dist' || name === 'node_modules' || name.startsWith('.')) continue
    if (name.endsWith('.mjs') || name.endsWith('.md')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) collectFiles(full, base, out)
    else out.set(relative(base, full).replace(/\\/g, '/'), readFileSync(full))
  }
  return out
}

/** Minimal ZIP (store + deflate) writer sufficient for .dwp install. */
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
  const out = Buffer.concat([...parts, ...central, end])
  writeFileSync(filePath, out)
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c
}

mkdirSync(stagingBin, { recursive: true })
mkdirSync(distDir, { recursive: true })

console.log('→ Installing community-plugin-sdk…')
run('mvn', ['-q', '-f', resolve(root, '../../../community-plugin-sdk/pom.xml'), 'install', '-DskipTests'], root)

console.log('→ Building hello sidecar jar…')
run('mvn', ['-q', '-f', join(sidecarDir, 'pom.xml'), 'package', '-DskipTests'], sidecarDir)
const builtJar = join(sidecarDir, 'target', jarName)
if (!existsSync(builtJar)) {
  console.error('Missing shaded jar:', builtJar)
  process.exit(1)
}
cpSync(builtJar, join(stagingBin, jarName))

console.log('→ Assembling unsigned .dwp…')
const files = collectFiles(root)
const manifestRaw = files.get('manifest.json')
if (!manifestRaw) {
  console.error('manifest.json missing')
  process.exit(1)
}
const checksums = {}
for (const [name, data] of files) {
  checksums[name] = sha256Hex(data)
}
const checksumsRaw = Buffer.from(JSON.stringify(checksums, null, 2) + '\n', 'utf8')
const zipEntries = new Map([['manifest.json', manifestRaw], ['checksums.json', checksumsRaw]])
for (const [name, data] of files) {
  if (name === 'manifest.json') continue
  zipEntries.set(name, data)
}
if (existsSync(outDwp)) rmSync(outDwp)
writeZip(outDwp, zipEntries)
console.log('✓ Package ready:', outDwp)
console.log('  Community Plugins → Settings → allow unsigned → install path above')
