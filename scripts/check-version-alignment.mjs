#!/usr/bin/env node
/**
 * Verify product version alignment across manifests, desktop scripts, and docs.
 * Source of truth: datawise-backend/pom.xml.
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function parseJson(rel) {
  try {
    return JSON.parse(read(rel))
  } catch (error) {
    failures.push(`${rel}: invalid JSON (${error.message})`)
    return null
  }
}

function pomVersion(rel) {
  const xml = read(rel)
  const artifactId = path.basename(path.dirname(rel))
  const match = xml.match(new RegExp(`<artifactId>${artifactId}</artifactId>\\s*<version>([^<]+)</version>`))
  if (!match) {
    failures.push(`${rel}: project version not found`)
    return null
  }
  return match[1].trim()
}

const version = pomVersion('datawise-backend/pom.xml')
if (!version) {
  console.error('Cannot resolve expected version')
  process.exit(1)
}

const manifests = [
  'package.json',
  'datawise-frontend/package.json',
  'datawise-frontend/pom.xml',
  'datawise-desktop/pom.xml',
  'headless-cli/package.json',
  'datawise-mcp/package.json',
  'datawise-vscode/package.json',
  'sql-editor/package.json',
]
for (const rel of manifests) {
  const actual = rel.endsWith('pom.xml') ? pomVersion(rel) : parseJson(rel)?.version
  if (actual != null && actual !== version) {
    failures.push(`${rel}: version ${actual} != ${version}`)
  }
}

const lockFiles = [
  'headless-cli/package-lock.json',
  'datawise-mcp/package-lock.json',
  'datawise-vscode/package-lock.json',
  'sql-editor/package-lock.json',
  'datawise-frontend/package-lock.json',
]
for (const rel of lockFiles) {
  const lock = parseJson(rel)
  if (!lock) continue
  if (lock.version !== version) failures.push(`${rel}: top-level version ${lock.version} != ${version}`)
  if (lock.packages?.['']?.version !== version) failures.push(`${rel}: root package version ${lock.packages?.['']?.version} != ${version}`)
}

const feLock = parseJson('datawise-frontend/package-lock.json')
if (feLock && feLock.packages?.['../sql-editor']?.version !== version) {
  failures.push(`datawise-frontend/package-lock.json: ../sql-editor version ${feLock.packages?.['../sql-editor']?.version} != ${version}`)
}

const textChecks = [
  ['headless-cli/src/main.ts', `.version('${version}')`],
  ['datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/config/OpenApiConfiguration.java', `.version("${version}")`],
  ['datawise-desktop/src/main/java/org/apache/datawise/desktop/updater/DesktopUpdaterService.java', `CURRENT_VERSION = "${version}"`],
  ['datawise-desktop/src/main/java/org/apache/datawise/desktop/cef/CefRuntimeConfig.java', `DataWiseCLI/${version}`],
  ['datawise-desktop/scripts/ensure-and-run.mjs', `datawise-desktop-${version}.jar`],
  ['datawise-desktop/scripts/run-desktop.sh', `target/datawise-desktop-${version}.jar`],
  ['datawise-desktop/scripts/run-desktop.cmd', `target\\datawise-desktop-${version}.jar`],
  ['datawise-frontend/src/features/layout/services/release-highlights.service.ts', `RELEASE_HIGHLIGHTS_VERSION = 'v${version}'`],
  ['README.md', `desktop-v${version}-`],
  ['README.zh-CN.md', `desktop-v${version}-`],
  ['README.md', `git tag v${version}`],
  ['README.zh-CN.md', `git tag v${version}`],
  ['docs/openapi/openapi.json', `"version":"${version}"`],
  ['datawise-frontend/scripts/desktop/publish-github-release.mjs', `: 'v${version}'`],
  ['datawise-frontend/scripts/desktop/publish-github-release.mjs', `DataWiseCLI Setup ${version}.exe`],
]
for (const [rel, needle] of textChecks) {
  if (!read(rel).includes(needle)) failures.push(`${rel}: missing "${needle}"`)
}

if (failures.length > 0) {
  console.error('Version alignment check failed:')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log(`Version alignment OK (${version})`)
