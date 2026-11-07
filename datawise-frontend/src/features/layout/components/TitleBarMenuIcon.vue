<script setup lang="ts">
import {DwIcon} from '@/core/icons'
import type {DwIconName} from '@/core/icons'

export type TitleBarMenuIconId =
    | 'database'
    | 'plugins'
    | 'devTools'
    | 'dashboard'
    | 'ai'
    | 'settings'
    | 'config'
    | 'help'
    | 'tools'
    | 'console'
    | 'refresh'
    | 'search'
    | 'tree'
    | 'terminal'
    | 'export'
    | 'align'
    | 'matrix'
    | 'usage'
    | 'connectors'
    | 'audit'
    | 'hooks'
    | 'notify'
    | 'command'
    | 'layout'
    | 'basic'
    | 'editor'
    | 'shortcuts'
    | 'about'
    | 'diff'
    | 'visibility'
    | 'open'
    | 'zoomIn'
    | 'zoomOut'
    | 'zoomReset'
    | 'tour'
    | 'sqlFile'
    | 'runtimeLog'

const ICON_MAP: Record<TitleBarMenuIconId, DwIconName> = {
    database: 'database',
    plugins: 'plugins',
    devTools: 'dev-tools',
    dashboard: 'dashboard',
    ai: 'ai',
    settings: 'settings',
    config: 'settings-basic',
    help: 'feedback',
    tools: 'tools',
    console: 'console',
    refresh: 'refresh',
    search: 'search',
    tree: 'tree',
    terminal: 'terminal',
    export: 'export',
    align: 'align',
    matrix: 'matrix',
    usage: 'usage',
    connectors: 'connectors',
    audit: 'audit',
    hooks: 'hooks',
    notify: 'notify',
    command: 'command',
    layout: 'layout',
    basic: 'settings-basic',
    editor: 'editor',
    shortcuts: 'shortcuts',
    about: 'about',
    diff: 'diff',
    visibility: 'visibility',
    open: 'open',
    zoomIn: 'zoom-in',
    zoomOut: 'zoom-out',
    zoomReset: 'zoom-reset',
    tour: 'tour',
    sqlFile: 'ddl',
    runtimeLog: 'editor',
}

withDefaults(
    defineProps<{
        name: TitleBarMenuIconId
        size?: 'sm' | 'md'
    }>(),
    {size: 'sm'},
)
</script>

<template>
  <DwIcon
      class="titlebar-menu-icon"
      :class="`titlebar-menu-icon--${size}`"
      :name="ICON_MAP[name]"
      :size="size"
      :stroke-width="1.5"
  />
</template>

<style scoped>
.titlebar-menu-icon {
  display: block;
  flex-shrink: 0;
}
</style>
