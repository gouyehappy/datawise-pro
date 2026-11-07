#!/usr/bin/env node
import { packageFromImportMeta } from '../scripts/package-java-dwp.mjs'

packageFromImportMeta(import.meta.url, {
  pluginId: 'io.datawise.community.kafka-ops',
  version: '0.1.11',
  jarName: 'kafka-ops-plugin.jar',
})
