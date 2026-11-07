import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/bump-version.mjs <version>')
  process.exit(1)
}

for (const rel of ['manifest.datawise.json', 'frontend/package.json']) {
  const path = join(root, rel)
  const json = JSON.parse(readFileSync(path, 'utf8'))
  json.version = version
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`)
}

const cargoPath = join(root, 'backend/Cargo.toml')
writeFileSync(
  cargoPath,
  readFileSync(cargoPath, 'utf8').replace(/^version = ".*"$/m, `version = "${version}"`),
)

const readmePath = join(root, 'README.md')
writeFileSync(
  readmePath,
  readFileSync(readmePath, 'utf8').replace(/0\.7\.11-beta\.\d+/g, version),
)

console.log('bumped to', version)
