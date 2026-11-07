#!/usr/bin/env node
/**
 * Build DataWise Kibana Logs community plugin (.dwp).
 *
 *   node community-plugins/kibana/package.mjs
 *   node community-plugins/kibana/package.mjs --skip-backend
 *   node community-plugins/kibana/package.mjs --sign-key-id datawise-community --sign-private-key-file .signing/private.b64
 *   node community-plugins/kibana/package.mjs --sign-key-file .signing/keys.json
 *
 * Env (optional): DATAWISE_PLUGIN_SIGN_KEY_ID, DATAWISE_PLUGIN_SIGN_PRIVATE_KEY_B64
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

function parseArgs(argv) {
  const flags = new Set()
  const opts = {
    signKeyId: process.env.DATAWISE_PLUGIN_SIGN_KEY_ID || '',
    signPrivateKeyB64: process.env.DATAWISE_PLUGIN_SIGN_PRIVATE_KEY_B64 || '',
    signPrivateKeyFile: '',
    signKeyFile: '',
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--skip-backend') flags.add('skip-backend')
    else if (arg === '--skip-frontend') flags.add('skip-frontend')
    else if (arg === '--sign-key-id' && argv[i + 1]) opts.signKeyId = argv[++i]
    else if (arg === '--sign-private-key-b64' && argv[i + 1]) opts.signPrivateKeyB64 = argv[++i]
    else if (arg === '--sign-private-key-file' && argv[i + 1]) opts.signPrivateKeyFile = argv[++i]
    else if (arg === '--sign-key-file' && argv[i + 1]) opts.signKeyFile = argv[++i]
    else if (arg === '--help' || arg === '-h') flags.add('help')
    else {
      console.error('Unknown argument:', arg)
      process.exit(2)
    }
  }
  return { flags, opts }
}

const { flags, opts } = parseArgs(process.argv.slice(2))
if (flags.has('help')) {
  console.log(`Usage: node package.mjs [options]

  --skip-backend                 Reuse existing binary in backend/
  --skip-frontend                Reuse existing ui/ build output
  --sign-key-id <id>             Ed25519 key id
  --sign-private-key-b64 <b64>   PKCS#8 private key (prefer file/env)
  --sign-private-key-file <path> File containing private key Base64
  --sign-key-file <path>         JSON from plugin:keygen ({id, privateKeyBase64})
`)
  process.exit(0)
}

const skipBackend = flags.has('skip-backend')
const skipFrontend = flags.has('skip-frontend')

if (opts.signKeyFile) {
  const keyPath = resolve(root, opts.signKeyFile)
  const keyJson = JSON.parse(readFileSync(keyPath, 'utf8'))
  if (!opts.signKeyId) opts.signKeyId = keyJson.id || keyJson.keyId || ''
  if (!opts.signPrivateKeyB64) opts.signPrivateKeyB64 = keyJson.privateKeyBase64 || ''
}
if (opts.signPrivateKeyFile) {
  opts.signPrivateKeyB64 = readFileSync(resolve(root, opts.signPrivateKeyFile), 'utf8').trim()
}

const wantSign = Boolean(opts.signKeyId && opts.signPrivateKeyB64)
if ((opts.signKeyId && !opts.signPrivateKeyB64) || (!opts.signKeyId && opts.signPrivateKeyB64)) {
  console.error('Signing requires both key id and private key (or --sign-key-file).')
  process.exit(2)
}

const osPart = platform() === 'win32' ? 'windows' : platform() === 'darwin' ? 'macos' : 'linux'
const archPart = arch() === 'arm64' ? 'arm64' : 'x86_64'
const target = `${osPart}-${archPart}`
const exeName = platform() === 'win32' ? 'datawise-plugin-kibana.exe' : 'datawise-plugin-kibana'
const staging = join(root, '.dwp-staging')
const distDir = join(root, 'dist')
const version = '0.3.2'
const outDwp = join(
  distDir,
  wantSign
    ? `io.datawise.community.kibana-${version}-${target}-signed.dwp`
    : `io.datawise.community.kibana-${version}-${target}.dwp`,
)

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
      name === 'tools' ||
      name === '.git' ||
      name === '.github' ||
      name === '.dwp-staging' ||
      name === '.signing' ||
      name.startsWith('.')
    ) {
      continue
    }
    if (
      name.endsWith('.mjs') ||
      name === 'README.md' ||
      name === 'CHANGELOG.md' ||
      name === 'manifest.datawise.json'
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

function patchManifestExecutable(manifestObj) {
  manifestObj.entrypoints = manifestObj.entrypoints || {}
  manifestObj.entrypoints.backend = {
    transport: 'stdio-jsonl',
    executable: `bin/${target}/${exeName}`,
  }
  return manifestObj
}

if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })
mkdirSync(distDir, { recursive: true })

const manifestSrc = join(root, 'manifest.datawise.json')
if (!existsSync(manifestSrc)) {
  console.error('Missing manifest.datawise.json')
  process.exit(1)
}
const manifest = patchManifestExecutable(JSON.parse(readFileSync(manifestSrc, 'utf8')))
writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

if (!skipBackend) {
  console.log('→ Building Go sidecar…')
  const backendDir = join(root, 'backend')
  const built = join(backendDir, exeName)
  run('go', ['build', '-o', built, '.'], backendDir)
  if (!existsSync(built)) {
    console.error('Missing Go binary:', built)
    process.exit(1)
  }
  const binDir = join(staging, 'bin', target)
  mkdirSync(binDir, { recursive: true })
  copyFileSync(built, join(binDir, exeName))
} else {
  const built = join(root, 'backend', exeName)
  if (!existsSync(built)) {
    console.error('Missing backend binary for --skip-backend:', built)
    process.exit(1)
  }
  const binDir = join(staging, 'bin', target)
  mkdirSync(binDir, { recursive: true })
  copyFileSync(built, join(binDir, exeName))
}

if (!skipFrontend) {
  console.log('→ Building Discover frontend (React + EUI)…')
  const fe = join(root, 'frontend')
  if (!existsSync(join(fe, 'package.json'))) {
    console.error('Missing frontend/package.json')
    process.exit(1)
  }
  if (!existsSync(join(fe, 'node_modules'))) {
    run('npm', ['install'], fe)
  }
  const prevInline = process.env.DATAWISE_INLINE
  process.env.DATAWISE_INLINE = '1'
  try {
    run('npm', ['run', 'build'], fe)
  } finally {
    if (prevInline === undefined) delete process.env.DATAWISE_INLINE
    else process.env.DATAWISE_INLINE = prevInline
  }
  run(process.execPath, [join(root, 'scripts', 'inline-ui-assets.mjs')], root)
}
if (!existsSync(join(root, 'ui', 'index.html'))) {
  console.error('Missing ui/index.html — frontend build failed or --skip-frontend without prior build')
  process.exit(1)
}
// Opaque-origin workbench iframes cannot load ./assets/*.js — require inlined HTML.
{
  const packedHtml = readFileSync(join(root, 'ui', 'index.html'), 'utf8')
  if (
    /<script\b[^>]*\bsrc=/i.test(packedHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))
    || !/DecompressionStream|createObjectURL/.test(packedHtml)
  ) {
    console.error(
      'ui/index.html is not DataWise-inlined. Re-run without --skip-frontend '
        + '(or: DATAWISE_INLINE=1 npm --prefix frontend run build && node scripts/inline-ui-assets.mjs).',
    )
    process.exit(1)
  }
}
cpSync(join(root, 'ui'), join(staging, 'ui'), { recursive: true })
run(process.execPath, [join(repoRoot, 'community-plugins', 'scripts', 'assert-ui-inlined.mjs'), join(staging, 'ui')], root)

if (existsSync(join(root, 'assets'))) {
  cpSync(join(root, 'assets'), join(staging, 'assets'), { recursive: true })
}
if (existsSync(join(root, 'LICENSE'))) {
  copyFileSync(join(root, 'LICENSE'), join(staging, 'LICENSE'))
}
if (existsSync(join(root, 'NOTICE'))) {
  copyFileSync(join(root, 'NOTICE'), join(staging, 'NOTICE'))
}

if (wantSign) {
  console.log(`→ Assembling signed .dwp (keyId=${opts.signKeyId})…`)
  const cli = join(repoRoot, 'scripts', 'datawise-plugin.mjs')
  run(
    process.execPath,
    [
      cli,
      'package',
      staging,
      '--out',
      outDwp,
      '--sign-key-id',
      opts.signKeyId,
      '--sign-private-key-b64',
      opts.signPrivateKeyB64,
    ],
    repoRoot,
  )
  console.log('✓ Signed package ready:', outDwp)
  console.log('  Add publicKeyBase64 under Community plugins → Settings → Trust keys')
  console.log('  Then install without enabling unsigned packages')
} else {
  console.log('→ Assembling unsigned .dwp…')
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
  console.log('✓ Package ready:', outDwp)
  console.log('  DataWise → Community plugins → Settings → allow unsigned → install path above')
  console.log('  Or rebuild with --sign-key-file .signing/keys.json for a signed package')
}
