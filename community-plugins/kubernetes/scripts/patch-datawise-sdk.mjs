import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function patchGo(file) {
  let s = fs.readFileSync(file, 'utf8')
  s = s.replace(
    /dbx\s+"github\.com\/t8y2\/dbx\/plugins\/sdk\/go\/dbx-plugin-sdk"/g,
    '"github.com/datawise-community/kubernetes/internal/rpc"',
  )
  // Only replace dbx. as a package qualifier, not io.dbx.
  s = s.replace(/(^|[^.\w])dbx\./gm, '$1rpc.')
  fs.writeFileSync(file, s)
  console.log('patched', path.relative(root, file))
}

for (const rel of [
  'backend/main.go',
  'backend/favorites.go',
  'backend/preferences.go',
  'backend/protocol_test.go',
]) {
  patchGo(path.join(root, rel))
}

// Fix accidental id rewrite from earlier naive replaceAll
const mainPath = path.join(root, 'backend/main.go')
let main = fs.readFileSync(mainPath, 'utf8')
main = main.replaceAll('io.rpc.k8s', 'io.datawise.community.kubernetes')
fs.writeFileSync(mainPath, main)
console.log('fixed plugin id in main.go')
