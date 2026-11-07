#!/usr/bin/env node
import { packageFromImportMeta } from '../scripts/package-java-dwp.mjs'

packageFromImportMeta(import.meta.url, {
  pluginId: 'io.datawise.community.redis-ops',
  version: '0.3.0',
  jarName: 'redis-ops-plugin.jar',
})
