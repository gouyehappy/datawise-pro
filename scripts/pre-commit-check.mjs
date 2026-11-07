#!/usr/bin/env node
/** 薄包装：调用通用 SOP 提交前检查 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const result = spawnSync(process.execPath, [path.join(dir, 'sop', 'pre-commit-check.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: path.join(dir, '..'),
})
process.exit(result.status ?? 1)
