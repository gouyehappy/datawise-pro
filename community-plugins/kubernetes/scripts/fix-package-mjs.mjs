import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = path.join(root, 'package.mjs')
let s = fs.readFileSync(pkgPath, 'utf8')

s = s.replace(/const version = '0\.1\.\d+'/, "const version = '0.1.8'")

if (!s.includes("flags.add('skip-frontend')")) {
  s = s.replace(
    "if (arg === '--skip-backend') flags.add('skip-backend')",
    "if (arg === '--skip-backend') flags.add('skip-backend')\n    else if (arg === '--skip-frontend') flags.add('skip-frontend')",
  )
}

s = s.replace(
  `function patchManifestExecutable(manifestObj) {
  manifestObj.entrypoints = manifestObj.entrypoints || {}
  manifestObj.entrypoints.backend = {
    transport: 'stdio-jsonl',
    executable: \`bin/\${target}/\${exeName}\`,
  }
  return manifestObj
}`,
  `function patchManifestExecutable(manifestObj) {
  manifestObj.entrypoints = manifestObj.entrypoints || {}
  manifestObj.entrypoints.backend = {
    transport: 'stdio-jsonl',
    executable: \`bin/\${target}/\${exeName}\`,
  }
  manifestObj.entrypoints.ui = { root: 'ui', entry: 'ui/index.html' }
  return manifestObj
}`,
)

const badUi = `if (existsSync(join(root, 'ui'))) {
  cpSync(join(root, 'ui'), join(staging, 'ui'), { recursive: true })
}`
const goodUi = `const skipFrontend = flags.has('skip-frontend')
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
  console.error('Missing ui/dist — run pnpm build in ui/ or omit --skip-frontend')
  process.exit(1)
}
cpSync(uiDist, join(staging, 'ui'), { recursive: true })`

if (s.includes(badUi)) {
  s = s.replace(badUi, goodUi)
} else if (!s.includes('cpSync(uiDist')) {
  console.error('Could not locate UI copy block to patch')
  process.exit(1)
}

// Avoid locked .dwp-staging by allowing force rename fallback
s = s.replace(
  'if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })',
  `if (existsSync(staging)) {
  try {
    rmSync(staging, { recursive: true, force: true })
  } catch {
    const junk = staging + '-junk-' + Date.now()
    fs.renameSync(staging, junk)
  }
}`,
)

// Ensure fs import has renameSync available - already have from 'node:fs' named imports
if (!s.includes('renameSync')) {
  s = s.replace('  rmSync,\n  statSync,', '  rmSync,\n  renameSync,\n  statSync,')
  s = s.replace(
    '    fs.renameSync(staging, junk)',
    '    renameSync(staging, junk)',
  )
}

fs.writeFileSync(pkgPath, s)
console.log('package.mjs fixed')
