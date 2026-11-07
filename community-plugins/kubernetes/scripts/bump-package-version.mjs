import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = path.join(root, 'package.mjs')
let s = fs.readFileSync(pkg, 'utf8')
s = s.replace(/const version = '0\.1\.\d+'/, "const version = '0.1.8'")
fs.writeFileSync(pkg, s)
console.log('package.mjs version → 0.1.8')
