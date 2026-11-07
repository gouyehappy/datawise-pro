// 从 .tmp-icons/ 下载的官方 SVG 中提取 path 数据，
// 生成 datawise-frontend/src/features/connection/constants/db-brand-icon-paths.ts
//
// 重跑前先下载源 SVG 到 .tmp-icons/：
//   oracle.svg          https://api.iconify.design/devicon/oracle.svg
//   sqlserver-plain.svg https://api.iconify.design/devicon-plain/microsoftsqlserver.svg
//   db2.svg             https://api.iconify.design/carbon/ibm-db2.svg
//   oceanbase-filled.svg https://raw.githubusercontent.com/oceanbase/oceanbase-design/master/packages/icons/svg/filled/oceanbase.svg
//   tdengine.svg        https://raw.githubusercontent.com/taosdata/TDengine/main/tdengine-logo.svg
import {readFileSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (name) => readFileSync(resolve(root, '.tmp-icons', name), 'utf8')

function extractPaths(svg) {
    return [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1])
}

const oracle = extractPaths(read('oracle.svg'))
const sqlserver = extractPaths(read('sqlserver-plain.svg'))
const db2 = extractPaths(read('db2.svg'))
const oceanbase = extractPaths(read('oceanbase-filled.svg'))
// TDengine 官方 logo 是「图形标 + 文字」，图形标是最后一个 path（M118.75 开头）
const tdengineAll = extractPaths(read('tdengine.svg'))
const tdengine = tdengineAll.filter((p) => p.startsWith('M118.75'))

if (oracle.length !== 1) throw new Error(`oracle: expected 1 path, got ${oracle.length}`)
if (sqlserver.length !== 1) throw new Error(`sqlserver: expected 1 path, got ${sqlserver.length}`)
if (db2.length < 1) throw new Error('db2: no paths')
if (oceanbase.length !== 3) throw new Error(`oceanbase: expected 3 paths, got ${oceanbase.length}`)
if (tdengine.length !== 1) throw new Error(`tdengine: mark path not found (${tdengineAll.length} paths total)`)

const banner = `/**
 * 品牌官方矢量 path（由 scripts/extract-brand-icon-paths.mjs 生成，勿手改）
 *
 * 来源：
 * - ORACLE_PATH     devicon oracle（MIT）
 * - SQLSERVER_PATH  devicon-plain microsoftsqlserver（MIT）
 * - DB2_PATH        IBM Carbon ibm-db2（Apache-2.0）
 * - OCEANBASE_PATH  oceanbase/oceanbase-design filled 官方图标
 * - TDENGINE_PATH   taosdata/TDengine 官方 logo 图形标
 */
`

const entries = [
    ['ORACLE_PATH', oracle.join(' ')],
    ['SQLSERVER_PATH', sqlserver.join(' ')],
    ['DB2_PATH', db2.join(' ')],
    ['OCEANBASE_PATH', oceanbase.join(' ')],
    ['TDENGINE_PATH', tdengine.join(' ')],
]

const body = entries
    .map(([name, d]) => `export const ${name} =\n    '${d.replace(/'/g, "\\'")}'\n`)
    .join('\n')

const out = resolve(root, 'datawise-frontend/src/features/connection/constants/db-brand-icon-paths.ts')
writeFileSync(out, banner + '\n' + body)
console.log('written:', out)
for (const [name, d] of entries) console.log(`  ${name}: ${d.length} chars`)
