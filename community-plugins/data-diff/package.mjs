#!/usr/bin/env node
import { packageFromImportMeta } from '../scripts/package-java-dwp.mjs'

packageFromImportMeta(import.meta.url, {
  pluginId: 'io.datawise.community.data-diff',
  version: '0.2.0',
  jarName: 'data-diff-plugin.jar',
})
