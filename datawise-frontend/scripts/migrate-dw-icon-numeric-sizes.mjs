/**
 * Replace DwIcon-only :size="N" / size="N" with token sizes in host Vue SFCs.
 * Does not touch AiIcon / PlusIcon / AiAnalysisStepIcon (numeric props).
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src')
/** @type {Record<number, string>} */
const map = {
  10: 'console',
  11: 'xs',
  12: 'xs',
  13: 'sm',
  14: 'sm',
  15: 'md',
  16: 'md',
  17: 'lg',
  18: 'lg',
  19: 'xl',
  20: 'rail',
  21: 'xl',
  22: 'xl',
}

let files = 0
let repl = 0

function rewriteDwIconSizes(text) {
  // Match <DwIcon ... size="14" ...> spanning attrs (non-greedy within tag)
  return text.replace(/<DwIcon\b([^>]*?)>/g, (full, attrs) => {
    const nextAttrs = attrs.replace(/:?size\s*=\s*(["'])(\d+)\1/g, (m, quote, numStr) => {
      const token = map[Number(numStr)]
      if (!token) return m
      repl++
      return `size=${quote}${token}${quote}`
    })
    return `<DwIcon${nextAttrs}>`
  })
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') continue
      walk(p)
      continue
    }
    if (!ent.name.endsWith('.vue')) continue
    const text = fs.readFileSync(p, 'utf8')
    const next = rewriteDwIconSizes(text)
    if (next !== text) {
      fs.writeFileSync(p, next)
      files++
    }
  }
}

walk(root)
console.log(`Updated ${files} files, ${repl} DwIcon size replacements.`)
