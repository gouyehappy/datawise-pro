#!/usr/bin/env node
/**
 * Community plugin CLI (thin wrapper around Java DwpPackageTool).
 *
 *   node scripts/datawise-plugin.mjs package <plugin-root> [--out path.dwp] [--sign-key-id ID] [--sign-private-key-b64 B64]
 *   node scripts/datawise-plugin.mjs keygen [key-id]
 *
 * Private keys are passed to Java via a temp file (--private-key-file), not process argv.
 */
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(root, 'datawise-backend')
const isWin = process.platform === 'win32'
const pathSep = isWin ? ';' : ':'

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {cwd, stdio: 'inherit', shell: isWin, env: process.env})
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function readManifestVersion(pluginRoot) {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, 'manifest.json'), 'utf8'))
  return {id: manifest.id, version: manifest.version}
}

function defaultOutputPath(pluginRoot) {
  const {id, version} = readManifestVersion(pluginRoot)
  return join(pluginRoot, 'dist', `${id}-${version}.dwp`)
}

function javaClasspath() {
  const cpFile = join(root, '.tmp-dwp-classpath.txt')
  run(isWin ? 'mvn.cmd' : 'mvn', [
    '-pl', 'datawise-common',
    '-q',
    '-DskipTests',
    'compile',
    'dependency:build-classpath',
    '-Dmdep.outputFile=' + cpFile,
    '-DincludeScope=runtime',
  ], backend)
  const deps = readFileSync(cpFile, 'utf8').trim()
  rmSync(cpFile, {force: true})
  return deps + pathSep + join(backend, 'datawise-common', 'target', 'classes')
}

function runTool(args) {
  run(isWin ? 'mvn.cmd' : 'mvn', ['-pl', 'datawise-common', '-q', '-DskipTests', 'compile'], backend)
  const cp = javaClasspath()
  run('java', ['-cp', cp, 'org.apache.datawise.backend.domain.communityplugin.DwpPackageTool', ...args], root)
}

function parsePackageArgs(argv) {
  const opts = {out: '', signKeyId: '', signPrivateKeyB64: ''}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out' && argv[i + 1]) opts.out = argv[++i]
    else if (arg === '--sign-key-id' && argv[i + 1]) opts.signKeyId = argv[++i]
    else if (arg === '--sign-private-key-b64' && argv[i + 1]) opts.signPrivateKeyB64 = argv[++i]
    else if (!arg.startsWith('--')) positional.push(arg)
  }
  return {pluginRoot: positional[0], opts}
}

function cmdPackage(argv) {
  const {pluginRoot, opts} = parsePackageArgs(argv)
  if (!pluginRoot) {
    console.error('Usage: datawise-plugin package <plugin-root> [--out path.dwp] [--sign-key-id ID] [--sign-private-key-b64 B64]')
    process.exit(2)
  }
  const absRoot = resolve(pluginRoot)
  const out = opts.out ? resolve(opts.out) : defaultOutputPath(absRoot)
  mkdirSync(dirname(out), {recursive: true})
  const args = [absRoot, out]
  const keyId = opts.signKeyId || process.env.DATAWISE_PLUGIN_SIGN_KEY_ID || ''
  const privateKey = opts.signPrivateKeyB64 || process.env.DATAWISE_PLUGIN_SIGN_PRIVATE_KEY_B64 || ''
  let keyDir = ''
  try {
    if (keyId && privateKey) {
      keyDir = mkdtempSync(join(tmpdir(), 'datawise-plugin-key-'))
      const keyFile = join(keyDir, 'private-key.b64')
      writeFileSync(keyFile, privateKey, {encoding: 'utf8', mode: 0o600})
      args.push('--key-id', keyId, '--private-key-file', keyFile)
    }
    runTool(args)
  } finally {
    if (keyDir) rmSync(keyDir, {recursive: true, force: true})
  }
}

function cmdKeygen(argv) {
  const keyId = argv[0] || 'publisher-dev'
  runTool(['--generate-key', keyId])
}

function printHelp() {
  console.log(`
Community plugin CLI

  node scripts/datawise-plugin.mjs package <plugin-root> [options]
  node scripts/datawise-plugin.mjs keygen [key-id]

Options (package):
  --out <path>                 Output .dwp path (default: <root>/dist/<id>-<version>.dwp)
  --sign-key-id <id>           Ed25519 key id (or env DATAWISE_PLUGIN_SIGN_KEY_ID)
  --sign-private-key-b64 <b64> Private key PKCS#8 Base64 (or env DATAWISE_PLUGIN_SIGN_PRIVATE_KEY_B64)
                               Passed to Java via a temp file, not process argv.

Examples:
  node scripts/datawise-plugin.mjs package community-plugins/examples/hello-workbench
  node scripts/datawise-plugin.mjs keygen datawise-examples
`)
}

const [cmd, ...rest] = process.argv.slice(2)
switch (cmd) {
  case 'package':
    cmdPackage(rest)
    break
  case 'keygen':
    cmdKeygen(rest)
    break
  case 'help':
  case '-h':
  case '--help':
  case undefined:
    printHelp()
    break
  default:
    console.error(`Unknown command: ${cmd}`)
    printHelp()
    process.exit(2)
}
