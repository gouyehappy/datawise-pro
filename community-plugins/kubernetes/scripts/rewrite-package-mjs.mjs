import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const http = fs.readFileSync(path.join(root, '../http-client/package.mjs'), 'utf8')

let s = http
s = s.replaceAll('community-plugins/http-client', 'community-plugins/kubernetes')
s = s.replaceAll('HTTP Client community plugin', 'Kubernetes community plugin')
s = s.replaceAll('datawise-plugin-http-client', 'datawise-plugin-kubernetes')
s = s.replaceAll('io.datawise.community.httpclient', 'io.datawise.community.kubernetes')
s = s.replace("const version = '0.1.0'", "const version = '0.1.8'")
s = s.replace(
  "if (arg === '--skip-backend') flags.add('skip-backend')",
  "if (arg === '--skip-backend') flags.add('skip-backend')\n    else if (arg === '--skip-frontend') flags.add('skip-frontend')",
)
s = s.replace(
  '  --skip-backend                 Reuse existing binary in backend/',
  '  --skip-backend                 Reuse existing binary in backend/\n  --skip-frontend                Reuse existing ui/dist',
)

const oldPatch = `function patchManifestExecutable(manifestObj) {
  manifestObj.entrypoints = manifestObj.entrypoints || {}
  manifestObj.entrypoints.backend = {
    transport: 'stdio-jsonl',
    executable: \`bin/\${target}/\${exeName}\`,
  }
  return manifestObj
}`

const newPatch = `function patchManifestExecutable(manifestObj) {
  manifestObj.entrypoints = manifestObj.entrypoints || {}
  manifestObj.entrypoints.backend = {
    transport: 'stdio-jsonl',
    executable: \`bin/\${target}/\${exeName}\`,
  }
  manifestObj.entrypoints.ui = { root: 'ui', entry: 'ui/index.html' }
  return manifestObj
}`

if (!s.includes(oldPatch)) throw new Error('patchManifest block not found')
s = s.replace(oldPatch, newPatch)

const oldUi = `if (existsSync(join(root, 'ui'))) {
  cpSync(join(root, 'ui'), join(staging, 'ui'), { recursive: true })
}`

const newUi = `const skipFrontend = flags.has('skip-frontend')
const uiDir = join(root, 'ui')
const uiDist = join(uiDir, 'dist')
if (!skipFrontend) {
  console.log('Building UI...')
  if (!existsSync(join(uiDir, 'node_modules'))) {
    run('pnpm', ['install', '--frozen-lockfile'], uiDir)
  }
  run('pnpm', ['run', 'build'], uiDir)
}
if (!existsSync(uiDist)) {
  console.error('Missing ui/dist')
  process.exit(1)
}
cpSync(uiDist, join(staging, 'ui'), { recursive: true })`

if (!s.includes(oldUi)) throw new Error('ui copy block not found')
s = s.replace(oldUi, newUi)

s = s.replace(
  '  rmSync,\n  statSync,',
  '  rmSync,\n  renameSync,\n  statSync,',
)
s = s.replace(
  'if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })',
  `if (existsSync(staging)) {
  try { rmSync(staging, { recursive: true, force: true }) }
  catch { renameSync(staging, staging + '-junk-' + Date.now()) }
}`,
)

fs.writeFileSync(path.join(root, 'package.mjs'), s)
console.log('rewrote package.mjs from http-client template')
