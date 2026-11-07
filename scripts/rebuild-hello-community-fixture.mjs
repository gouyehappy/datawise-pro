#!/usr/bin/env node
/**
 * Rebuild signed hello fixture + trust public key for classpath store installs.
 */
import {copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(root, 'datawise-backend')
const isWin = process.platform === 'win32'
const pathSep = isWin ? ';' : ':'

function run(cmd, args, cwd, capture = false) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: isWin,
  })
  if (result.status !== 0) {
    if (capture) {
      process.stderr.write(result.stderr || result.stdout || '')
    }
    process.exit(result.status ?? 1)
  }
  return result
}

console.log('→ Install SDK')
run(isWin ? 'mvn.cmd' : 'mvn', ['-q', '-f', join(root, 'community-plugin-sdk/pom.xml'), 'install', '-DskipTests'], root)

console.log('→ Compile DwpPackageTool classpath')
const cpFile = join(root, '.tmp-dwp-classpath.txt')
run(isWin ? 'mvn.cmd' : 'mvn', [
  '-pl', 'datawise-common',
  '-q',
  '-DskipTests',
  'compile',
  'dependency:build-classpath',
  `-Dmdep.outputFile=${cpFile}`,
  '-DincludeScope=runtime',
], backend)
const deps = readFileSync(cpFile, 'utf8').trim()
rmSync(cpFile, {force: true})
const cp = `${deps}${pathSep}${join(backend, 'datawise-common', 'target', 'classes')}`

console.log('→ Keygen datawise-examples')
const keygen = run('java', ['-cp', cp, 'org.apache.datawise.backend.domain.communityplugin.DwpPackageTool', '--generate-key', 'datawise-examples'], root, true)
const text = `${keygen.stdout || ''}${keygen.stderr || ''}`
let payload
try {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  payload = JSON.parse(text.slice(start, end + 1))
} catch {
  console.error('Failed to parse keygen JSON from:\n', text)
  process.exit(1)
}
const pub = payload.publicKeyBase64
const priv = payload.privateKeyBase64
if (!pub || !priv) {
  console.error('keygen missing keys', payload)
  process.exit(1)
}

const trustPath = join(backend, 'datawise-server/src/main/resources/community-plugin-fixtures/datawise-examples.trust.json')
writeFileSync(trustPath, `${JSON.stringify({
  id: 'datawise-examples',
  label: 'DataWise Examples',
  publicKeyBase64: pub,
}, null, 2)}\n`)

console.log('→ Package unsigned hello (builds sidecar)')
run(process.execPath, [join(root, 'community-plugins/examples/hello-workbench/package.mjs')], root)

const signedOut = join(root, 'community-plugins/examples/hello-workbench/dist/io.datawise.example.hello-1.0.0.signed.dwp')
mkdirSync(dirname(signedOut), {recursive: true})
console.log('→ Sign package')
run(process.execPath, [
  join(root, 'scripts/datawise-plugin.mjs'),
  'package',
  join(root, 'community-plugins/examples/hello-workbench'),
  '--out', signedOut,
  '--sign-key-id', 'datawise-examples',
  '--sign-private-key-b64', priv,
], root)

const fixture = join(backend, 'datawise-server/src/main/resources/community-plugin-fixtures/io.datawise.example.hello-1.0.0.dwp')
copyFileSync(signedOut, fixture)
console.log('✓ Updated', fixture)
console.log('✓ Updated', trustPath)
