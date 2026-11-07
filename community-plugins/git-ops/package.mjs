#!/usr/bin/env node
import { packageFromImportMeta } from '../scripts/package-java-dwp.mjs'

packageFromImportMeta(import.meta.url, {
  pluginId: 'io.datawise.community.git-ops',
  version: '0.12.24',
  jarName: 'git-ops-plugin.jar',
})
