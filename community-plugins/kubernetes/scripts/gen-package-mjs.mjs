import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const httpPkg = path.join(root, '../http-client/package.mjs')
let s = fs.readFileSync(httpPkg, 'utf8')
s = s.replaceAll('community-plugins/http-client', 'community-plugins/kubernetes')
s = s.replaceAll('HTTP Client community plugin', 'Kubernetes community plugin')
s = s.replaceAll('datawise-plugin-http-client', 'datawise-plugin-kubernetes')
s = s.replaceAll('io.datawise.community.httpclient', 'io.datawise.community.kubernetes')
s = s.replace("const version = '0.1.0'", "const version = '0.1.7'")
s = s.replace(
  "if (arg === '--skip-backend') flags.add('skip-backend')",
  "if (arg === '--skip-backend') flags.add('skip-backend')\n    else if (arg === '--skip-frontend') flags.add('skip-frontend')",
)
s = s.replace(
  '  --skip-backend                 Reuse existing binary in backend/',
  '  --skip-backend                 Reuse existing binary in backend/\n  --skip-frontend                Reuse existing ui/dist',
)
s = s.replace(
  `manifestObj.entrypoints.backend = {
    transport: 'stdio-jsonl',
    executable: \`bin/\${target}/\${exeName}\`,
  }
  return manifestObj`,
  `manifestObj.entrypoints.backend = {
    transport: 'stdio-jsonl',
    executable: \`bin/\${target}/\${exeName}\`,
  }
  manifestObj.entrypoints.ui = { root: 'ui', entry: 'ui/index.html' }
  return manifestObj`,
)
s = s.replace(
  `if (existsSync(join(root, 'ui'))) {
  cpSync(join(root, 'ui'), join(staging, 'ui'), { recursive: true })
}`,
  `const skipFrontend = flags.has('skip-frontend')
const uiDir = join(root, 'ui')
const uiDist = join(uiDir, 'dist')
if (!skipFrontend) {
  console.log('→ Building UI…')
  if (!existsSync(join(uiDir, 'node_modules'))) {
    run('pnpm', ['install', '--frozen-lockfile'], uiDir)
  }
  run('pnpm', ['run', 'build'], uiDir)
}
if (!existsSync(uiDist)) {
  console.error('Missing ui/dist — run pnpm build in ui/ or omit --skip-frontend')
  process.exit(1)
}
cpSync(uiDist, join(staging, 'ui'), { recursive: true })`,
)

fs.writeFileSync(path.join(root, 'package.mjs'), s)
console.log('wrote package.mjs')
