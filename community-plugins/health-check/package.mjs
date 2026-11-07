#!/usr/bin/env node
import { packageFromImportMeta } from '../scripts/package-java-dwp.mjs'

packageFromImportMeta(import.meta.url, {
  pluginId: 'io.datawise.community.health-check',
  version: '0.1.0',
  jarName: 'health-check-plugin.jar',
})
