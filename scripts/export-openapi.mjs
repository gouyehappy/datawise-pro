#!/usr/bin/env node
/**
 * Export OpenAPI JSON from a running DataWise backend.
 * Usage: node scripts/export-openapi.mjs [baseUrl]
 */
import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const baseUrl = (process.argv[2] || 'http://127.0.0.1:18421').replace(/\/$/, '')
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'openapi')
const outFile = join(outDir, 'openapi.json')

const res = await fetch(`${baseUrl}/v3/api-docs`)
if (!res.ok) {
    console.error(`Failed to fetch OpenAPI: HTTP ${res.status} from ${baseUrl}/v3/api-docs`)
    console.error('Start the backend first (mvn spring-boot:run -pl datawise-server -am).')
    process.exit(1)
}
const json = await res.text()
await mkdir(outDir, {recursive: true})
await writeFile(outFile, json, 'utf8')
console.log(`Wrote ${outFile}`)
