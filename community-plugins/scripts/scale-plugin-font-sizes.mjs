#!/usr/bin/env node
/**
 * Rewrite plugin chrome font sizes onto the host body ladder:
 *   font-size: Npx                         → token / % of --dw-font-size
 *   font-size: calc(Npx * --dw-ui-text-scale) → same (legacy scale-multiply form)
 *   font: WEIGHT calc(Npx * --dw-ui-text-scale) FAMILY → weight + token + family
 *
 * Do NOT multiply absolute px by --dw-ui-text-scale; that fights custom body px.
 * Prefer --dw-text-* / --dw-font-size (see PLUGIN_TYPOGRAPHY.md).
 *
 * Usage:
 *   node community-plugins/scripts/scale-plugin-font-sizes.mjs
 *   node community-plugins/scripts/scale-plugin-font-sizes.mjs --dry-run
 *   node community-plugins/scripts/scale-plugin-font-sizes.mjs kafka-ops redis-ops
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry-run')
const ONLY = process.argv.slice(2).filter((a) => a !== '--dry-run')

const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  'target',
  '.git',
  'coverage',
  'vendor',
  'out',
  '.dwp-staging',
])

const EXT = new Set(['.css', '.vue', '.tsx', '.ts', '.jsx', '.js', '.html', '.scss'])

const BODY_MD = 13.5

/** Map absolute px (at md) → host ladder token or relative calc. */
function mapBodyPx(n) {
  const ratio = n / BODY_MD
  if (ratio <= 0.78) return 'var(--dw-text-2xs)'
  if (ratio <= 0.9) return 'var(--dw-text-xs)'
  if (ratio <= 1.02) return 'var(--dw-font-size)'
  if (ratio <= 1.1) return 'var(--dw-text-md)'
  if (ratio <= 1.2) return 'var(--dw-text-lg)'
  if (ratio <= 1.3) return 'var(--dw-text-xl)'
  if (ratio <= 1.45) return 'var(--dw-text-2xl)'
  return `calc(var(--dw-font-size) * ${ratio.toFixed(2)})`
}

const SCALED_SIZE_RE =
  /font-size\s*:\s*calc\(\s*(\d+(?:\.\d+)?)px\s*\*\s*var\(--dw-ui-text-scale\s*,\s*1\)\s*\)(\s*!important)?(\s*;)?/gi
const BARE_SIZE_RE = /font-size\s*:\s*(\d+(?:\.\d+)?)px(\s*!important)?(\s*;)?/gi
/** font: [style] weight size[/line-height] family — size is calc(Npx * scale) */
const FONT_SHORTHAND_RE =
  /font\s*:\s*((?:(?:normal|italic|oblique|inherit)\s+)?)(\d{2,4})\s+calc\(\s*(\d+(?:\.\d+)?)px\s*\*\s*var\(--dw-ui-text-scale\s*,\s*1\)\s*\)(?:\s*\/\s*([\d.]+))?\s+([^;!"'}]+)(\s*!important)?(\s*;)?/gi
/** font: SIZE[/lh] FAMILY (no weight) — bare px body */
const FONT_SIZE_FAMILY_RE =
  /font\s*:\s*(\d+(?:\.\d+)?)px(?:\s*\/\s*([\d.]+))?\s+([^;!"'}]+)(\s*!important)?(\s*;)?/gi
/** font: WEIGHT SIZE[/lh] FAMILY — bare px */
const FONT_WEIGHT_SIZE_RE =
  /font\s*:\s*((?:(?:normal|italic|oblique|inherit)\s+)?)(\d{2,4})\s+(\d+(?:\.\d+)?)px(?:\s*\/\s*([\d.]+))?\s+([^;!"'}]+)(\s*!important)?(\s*;)?/gi

function shouldSkipFile(filePath) {
  const base = path.basename(filePath)
  if (base.includes('.spec.') || base.includes('.test.') || base.endsWith('.d.ts')) return true
  if (base === 'scale-plugin-font-sizes.mjs') return true
  return false
}

function transform(source) {
  let count = 0
  const tail = (important, semi) => `${important || ''}${semi || ''}`
  let next = source.replace(SCALED_SIZE_RE, (_full, num, important, semi) => {
    count += 1
    return `font-size: ${mapBodyPx(Number(num))}${tail(important, semi)}`
  })
  next = next.replace(BARE_SIZE_RE, (full, num, important, semi) => {
    if (/var\(--dw-/.test(full)) return full
    count += 1
    return `font-size: ${mapBodyPx(Number(num))}${tail(important, semi)}`
  })
  next = next.replace(
    FONT_SHORTHAND_RE,
    (_full, stylePrefix, weight, num, lineHeight, family, important, semi) => {
      count += 1
      const size = mapBodyPx(Number(num))
      const lh = lineHeight ? ` / ${lineHeight}` : ''
      return `font: ${stylePrefix || ''}${weight} ${size}${lh} ${family.trim()}${tail(important, semi)}`
    },
  )
  next = next.replace(
    FONT_WEIGHT_SIZE_RE,
    (_full, stylePrefix, weight, num, lineHeight, family, important, semi) => {
      count += 1
      const size = mapBodyPx(Number(num))
      const lh = lineHeight ? ` / ${lineHeight}` : ''
      return `font: ${stylePrefix || ''}${weight} ${size}${lh} ${family.trim()}${tail(important, semi)}`
    },
  )
  next = next.replace(
    FONT_SIZE_FAMILY_RE,
    (_full, num, lineHeight, family, important, semi) => {
      count += 1
      const size = mapBodyPx(Number(num))
      const lh = lineHeight ? ` / ${lineHeight}` : ''
      return `font: ${size}${lh} ${family.trim()}${tail(important, semi)}`
    },
  )
  return {next, count}
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, {withFileTypes: true})) {
    if (name.name.startsWith('.')) continue
    const full = path.join(dir, name.name)
    if (name.isDirectory()) {
      if (SKIP_DIR.has(name.name)) continue
      walk(full, out)
      continue
    }
    if (!EXT.has(path.extname(name.name))) continue
    if (shouldSkipFile(full)) continue
    out.push(full)
  }
  return out
}

const roots =
  ONLY.length > 0
    ? ONLY.map((name) => path.join(ROOT, name)).filter((p) => fs.existsSync(p))
    : [ROOT]

const files = roots.flatMap((r) => walk(r))
let changedFiles = 0
let totalReplacements = 0

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8')
  if (
    !/font-size\s*:\s*(?:\d+(?:\.\d+)?px|calc\(\s*\d)/i.test(raw) &&
    !/font\s*:\s*[^;{]*\d+(?:\.\d+)?px/i.test(raw)
  ) {
    continue
  }
  const {next, count} = transform(raw)
  if (count === 0 || next === raw) continue
  changedFiles += 1
  totalReplacements += count
  const rel = path.relative(ROOT, file)
  console.log(`${DRY ? 'DRY ' : ''}${rel}: ${count}`)
  if (!DRY) fs.writeFileSync(file, next, 'utf8')
}

console.log(
  DRY
    ? `Dry-run: ${changedFiles} files / ${totalReplacements} replacements`
    : `Updated ${changedFiles} files / ${totalReplacements} replacements`,
)
