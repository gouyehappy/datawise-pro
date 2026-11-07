#!/usr/bin/env node
import { packageFromImportMeta } from '../scripts/package-java-dwp.mjs'

packageFromImportMeta(import.meta.url, {
  pluginId: 'io.datawise.community.duckdb',
  version: '0.1.0',
  jarName: 'duckdb-plugin.jar',
})
