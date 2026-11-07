import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src')
const map = [
  ['--mp-caption', '--dw-text-xs'],
  ['--mp-body', '--dw-text-sm'],
  ['--mp-sub', '--dw-text-md'],
  ['--mp-section', '--dw-text-lg'],
  ['--mp-title-sm', '--dw-text-2xl'],
  ['--mp-title', '--dw-text-3xl'],
  ['--mp-stat-num', '--dw-text-display'],
]
const skip = new Set(['variables.css', 'ui-text-scale.css', 'typography.css'])

let files = 0
let repl = 0

function walk(dir) {
  for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') continue
      walk(p)
      continue
    }
    if (!/\.(vue|css|scss)$/.test(ent.name)) continue
    if (skip.has(ent.name)) continue
    let text = fs.readFileSync(p, 'utf8')
    let next = text
    for (const [from, to] of map) {
      const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      const matches = next.match(re)
      if (matches) repl += matches.length
      next = next.replace(re, to)
    }
    if (next !== text) {
      fs.writeFileSync(p, next)
      files++
    }
  }
}

walk(root)
console.log(`Updated ${files} files, ${repl} replacements.`)
