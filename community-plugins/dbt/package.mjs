#!/usr/bin/env node
import { packageFromImportMeta } from '../scripts/package-java-dwp.mjs'

packageFromImportMeta(import.meta.url, {
  pluginId: 'io.datawise.community.dbt',
  version: '0.3.0',
  jarName: 'dbt-plugin.jar',
})
