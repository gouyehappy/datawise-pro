#!/usr/bin/env node
/**
 * Remove stale community-plugin .dwp-staging directories older than 24h.
 * Usage: node scripts/clean-dwp-staging.mjs [--hours 24] [--dry-run]
 */
import {readdirSync, rmSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const hoursIdx = argv.indexOf('--hours')
const maxAgeHours = hoursIdx >= 0 ? Number(argv[hoursIdx + 1]) || 24 : 24
const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000

const scanRoots = [
  join(root, 'community-plugins'),
  join(root, 'config'),
]

let removed = 0
function walk(dir, depth = 0) {
  if (depth > 4) return
  let entries
  try {
    entries = readdirSync(dir, {withFileTypes: true})
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const full = join(dir, entry.name)
    if (entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist') continue
    if (entry.name === '.dwp-staging' || entry.name.startsWith('.dwp-staging-')) {
      try {
        const mtime = statSync(full).mtimeMs
        if (mtime < cutoff) {
          if (dryRun) {
            console.log(`[dry-run] would remove ${full}`)
          } else {
            rmSync(full, {recursive: true, force: true})
            console.log(`removed ${full}`)
          }
          removed++
        }
      } catch (ex) {
        console.warn(`skip ${full}: ${ex.message}`)
      }
      continue
    }
    walk(full, depth + 1)
  }
}

for (const scan of scanRoots) {
  walk(scan)
}
console.log(`clean-dwp-staging done (removed=${removed}, maxAgeHours=${maxAgeHours})`)
