<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {
    ComboboxGroup,
    ComboboxInput,
    ComboboxItem,
    ComboboxLabel,
    ComboboxRoot,
    ComboboxViewport,
} from 'reka-ui'
import {AppPalette, EmptyState} from '@/core/components'
import {formatBindingParts} from '@/core/shortcuts/shortcut.service'
import {useShortcutSettingsStore} from '@/features/settings/stores/shortcut-settings-store'
import {useGlobalObjectSearch} from '@/features/layout/composables/useGlobalObjectSearch'
import {
    indexGlobalObjectSearchEntries,
    searchGlobalObjectEntries,
    type GlobalObjectSearchEntry,
} from '@/features/explorer/services/global-object-search.service'
import {
    discoveryHitsToSearchEntries,
    mergeDiscoveryEntries,
} from '@/features/explorer/services/global-object-discovery.service'
import {activateGlobalObjectSearchEntry} from '@/features/explorer/services/global-object-search.actions'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {platformApi} from '@/api'
import {useDebouncedRef} from '@/core/utils/debounced-ref'
import {executeShortcutAction} from '@/core/shortcuts/execute-action'
import {
    isPaletteCommandMode,
    searchPaletteCommands,
    searchPaletteCommandsScored,
    type PaletteCommandEntry,
} from '@/features/layout/services/palette-command.service'
import type {AiKnowledgeEntry} from '@/features/ai/knowledge/types/ai-knowledge.types'
import {fetchAiKnowledgeEntries} from '@/features/ai/knowledge/services/ai-knowledge.service'
import {
    isPaletteKnowledgeMode,
    knowledgeEntrySubtitle,
    searchKnowledgeEntries,
} from '@/features/layout/services/palette-knowledge.service'
import {activatePaletteKnowledgeEntry} from '@/features/layout/services/palette-knowledge.actions'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {canAccessFeature} from '@/features/auth/services/feature-permission.service'
import {usePluginPresetSummary} from '@/features/plugin/composables/usePluginPresetSummary'
import {
    buildPaletteNavigationEntries,
    searchPaletteNavigationEntries,
    type PaletteNavigationEntry,
} from '@/features/layout/services/palette-navigation.service'

type PaletteListItem =
    | {kind: 'object'; entry: GlobalObjectSearchEntry}
    | {kind: 'command'; entry: PaletteCommandEntry}
    | {kind: 'knowledge'; entry: AiKnowledgeEntry}
    | {kind: 'navigation'; entry: PaletteNavigationEntry}

type PaletteSection = {
    key: string
    label: string
    items: Array<{item: PaletteListItem; index: number}>
}

const {t, te} = useI18n()
const {globalObjectSearchOpen, closeGlobalObjectSearch} = useGlobalObjectSearch()
const explorer = useExplorerStore()
const shortcuts = useShortcutSettingsStore()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const shortcutPanel = useShortcutPanelStore()
const pluginStore = usePluginStore()
const appConfig = useAppConfigStore()
const {referencePresetId, referencePresetConflictCount} = usePluginPresetSummary()

const bookmarksEnabled = computed(() => pluginStore.isEnabled('p-sql-bookmarks'))
const sqlHistoryEnabled = computed(() => pluginStore.isEnabled('p-sql-history'))

const query = ref('')
const knowledgeEntries = ref<AiKnowledgeEntry[]>([])
const knowledgeLoaded = ref(false)
const discoveryEntries = ref<GlobalObjectSearchEntry[]>([])
const debouncedQuery = useDebouncedRef(query, 220)

const indexedEntries = computed(() => {
    if (!globalObjectSearchOpen.value) return []
    void explorer.treeVersion
    return indexGlobalObjectSearchEntries(explorer.tree)
})

const commandMode = computed(() => isPaletteCommandMode(query.value))
const knowledgeMode = computed(() => isPaletteKnowledgeMode(query.value))

const navigationEntries = computed(() =>
    searchPaletteNavigationEntries(
        buildPaletteNavigationEntries({
            query: query.value,
            t,
            te,
            setModule: (module) => layout.setModule(module),
            openConsole: (options) => workspace.openConsole(options),
            toggleShortcutPanel: (panel) => layout.toggleShortcutPanel(panel),
            openPluginDevTools: () => pluginStore.openPluginDevTools(),
            openConnectorMarket: () => pluginStore.openConnectorMarket(),
            openDataCatalog: () => workspace.openDataCatalog(),
            openSettingsModule: (module, anchor) => layout.openSettingsModule(module, anchor),
            isPluginDevToolsVisible: () => appConfig.isPluginDevToolsVisible(),
            bookmarksEnabled: bookmarksEnabled.value,
            sqlHistoryEnabled: sqlHistoryEnabled.value,
            sqlLogs: shortcutPanel.sqlLogs,
            savedConsoles: shortcutPanel.savedConsoles,
            plugins: pluginStore.items,
            referencePresetId: referencePresetId.value,
            referencePresetConflictCount: referencePresetConflictCount.value,
            isPluginEnabled: (id) => pluginStore.isEnabled(id),
            focusPlugin: (id) => pluginStore.focusPlugin(id),
            setPluginEnabled: (id, enabled) => pluginStore.setEnabled(id, enabled),
            applyPreset: (presetId) => pluginStore.applyPreset(presetId),
            setReferencePresetId: (presetId) => pluginStore.setReferencePresetId(presetId),
            alignToReferencePreset: () => pluginStore.alignToReferencePreset(),
            openPluginPresetDiff: () => pluginStore.openPluginPresetDiff(),
            getReferencePresetId: () => pluginStore.referencePresetId(),
            canAccessFeature,
            canAccessNavModule: (module) => layout.canAccessNavModule(module),
        }),
        query.value,
    ),
)

const filteredObjects = computed(() => {
    if (commandMode.value || knowledgeMode.value) return []
    const local = searchGlobalObjectEntries(indexedEntries.value, query.value)
    if (!query.value.trim() || query.value.trim().startsWith('>') || query.value.trim().startsWith('#')) {
        return local
    }
    return mergeDiscoveryEntries(local, discoveryEntries.value)
})

const filteredKnowledge = computed(() =>
    searchKnowledgeEntries(knowledgeEntries.value, query.value),
)

    const filteredCommands = computed(() =>
        searchPaletteCommands(query.value, (key) => t(key)),
    )

    const scoredCommands = computed(() =>
        searchPaletteCommandsScored(query.value, (key) => t(key)),
    )

    const listItems = computed<PaletteListItem[]>(() => {
        if (commandMode.value) {
            return filteredCommands.value.map((entry) => ({kind: 'command' as const, entry}))
        }
        if (knowledgeMode.value) {
            return filteredKnowledge.value.map((entry) => ({kind: 'knowledge' as const, entry}))
        }

        const items: PaletteListItem[] = navigationEntries.value.map((entry) => ({
            kind: 'navigation' as const,
            entry,
        }))

        for (const entry of filteredObjects.value) {
            items.push({kind: 'object' as const, entry})
        }

        if (query.value.trim()) {
            const knowledgeItems = filteredKnowledge.value.slice(0, 6).map((entry) => ({
                kind: 'knowledge' as const,
                entry,
            }))
            const topCommand = scoredCommands.value[0]
            const promoteCommands =
                Boolean(topCommand && topCommand.score >= 70)
                || (!filteredObjects.value.length && !navigationEntries.value.length)
            const commandItems = scoredCommands.value.slice(0, promoteCommands ? 6 : 4).map((entry) => ({
                kind: 'command' as const,
                entry,
            }))
            if (promoteCommands) {
                return [...commandItems, ...items, ...knowledgeItems]
            }
            if (!filteredObjects.value.length && !navigationEntries.value.length) {
                return [...knowledgeItems, ...commandItems]
            }
            return [...items, ...knowledgeItems, ...commandItems]
        }

        if (filteredCommands.value.length) {
            return [
                ...items,
                ...filteredCommands.value.slice(0, 4).map((entry) => ({kind: 'command' as const, entry})),
            ]
        }
        return items
    })

function sectionKey(item: PaletteListItem): string {
    if (item.kind === 'navigation') return `nav:${item.entry.group}`
    return item.kind
}

function sectionLabel(item: PaletteListItem): string {
    if (item.kind === 'navigation') return item.entry.group
    if (item.kind === 'object') return t('globalObjectSearch.objectsGroup')
    if (item.kind === 'knowledge') return t('globalObjectSearch.knowledgeLabel')
    return t('globalObjectSearch.commandLabel')
}

const listSections = computed<PaletteSection[]>(() => {
    const sections: PaletteSection[] = []
    let current: PaletteSection | null = null
    listItems.value.forEach((item, index) => {
        const key = sectionKey(item)
        if (!current || current.key !== key) {
            current = {key, label: sectionLabel(item), items: []}
            sections.push(current)
        }
        current.items.push({item, index})
    })
    return sections
})

async function ensureKnowledgeLoaded() {
    if (knowledgeLoaded.value) return
    if (import.meta.env.VITE_DATAWISE_EDITION === 'standard') {
        knowledgeEntries.value = []
        knowledgeLoaded.value = true
        return
    }
    try {
        knowledgeEntries.value = await fetchAiKnowledgeEntries()
    } catch {
        knowledgeEntries.value = []
    } finally {
        knowledgeLoaded.value = true
    }
}

async function refreshDiscovery(q: string) {
    const trimmed = q.trim()
    if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('#') || trimmed.length < 2) {
        discoveryEntries.value = []
        return
    }
    try {
        const page = await platformApi.searchDiscovery(trimmed, 30)
        discoveryEntries.value = discoveryHitsToSearchEntries(page.hits)
    } catch {
        discoveryEntries.value = []
    }
}

watch(globalObjectSearchOpen, (open) => {
    if (open) {
        query.value = ''
        discoveryEntries.value = []
        void ensureKnowledgeLoaded()
    } else {
        discoveryEntries.value = []
    }
})

watch(debouncedQuery, (q) => {
    if (!globalObjectSearchOpen.value) return
    void refreshDiscovery(q)
})

function kindLabel(entry: GlobalObjectSearchEntry): string {
    return t(`globalObjectSearch.types.${entry.kind}`)
}

function commandBindingChips(id: PaletteCommandEntry['id']): string[] {
    const binding = shortcuts.getBinding(id)
    if (!binding.trim()) return []
    return formatBindingParts(binding)
}

function runItem(item: PaletteListItem) {
    if (item.kind === 'object') {
        void activateGlobalObjectSearchEntry(item.entry)
    } else if (item.kind === 'knowledge') {
        void activatePaletteKnowledgeEntry(item.entry)
    } else if (item.kind === 'navigation') {
        item.entry.run()
    } else {
        executeShortcutAction(item.entry.id)
    }
    closeGlobalObjectSearch()
}

function listItemKey(item: PaletteListItem): string {
    if (item.kind === 'object') return item.entry.nodeId
    if (item.kind === 'knowledge') return item.entry.id
    if (item.kind === 'navigation') return item.entry.id
    return item.entry.id
}

function isSingleLineItem(item: PaletteListItem): boolean {
    if (item.kind === 'navigation') return !item.entry.hint
    if (item.kind === 'command') return true
    if (item.kind === 'knowledge') return !knowledgeEntrySubtitle(item.entry)
    return false
}
</script>

<template>
  <AppPalette
      :open="globalObjectSearchOpen"
      :ariaLabel="t('globalObjectSearch.title')"
      width="min(680px, calc(100vw - 32px))"
      :maxHeight="'min(64vh, 560px)'"
      @close="closeGlobalObjectSearch"
  >
    <ComboboxRoot
        :open="true"
        :ignore-filter="true"
        model-value=""
    >
      <div class="app-palette__search">
        <ComboboxInput
            v-model="query"
            class="app-palette__input"
            :placeholder="t('globalObjectSearch.placeholder')"
        />
      </div>

      <div
          v-if="commandMode || knowledgeMode || !query.trim() || (!indexedEntries.length && !knowledgeEntries.length && !navigationEntries.length)"
          class="app-palette__context"
      >
        <p v-if="commandMode" class="app-palette__context-main">
          {{ t('globalObjectSearch.commandModeHint') }}
        </p>
        <p v-else-if="knowledgeMode" class="app-palette__context-main">
          {{ t('globalObjectSearch.knowledgeModeHint') }}
        </p>
        <template v-else-if="!query.trim()">
          <p class="app-palette__context-main">{{ t('commandPalette.pluginsSearchHint') }}</p>
          <p class="app-palette__context-aside">
            {{ t('commandPalette.presets.currentReference', {
              preset: t(`plugin.presets.${referencePresetId}.label`),
            }) }}
            <template v-if="referencePresetConflictCount > 0">
              · {{ t('commandPalette.presets.currentReferenceConflicts', { count: referencePresetConflictCount }) }}
            </template>
          </p>
        </template>
        <p v-else class="app-palette__context-main">
          {{ t('globalObjectSearch.noIndexedObjects') }}
        </p>
      </div>

      <ComboboxViewport v-if="listItems.length" class="app-palette__list">
        <ComboboxGroup
            v-for="section in listSections"
            :key="section.key"
        >
          <ComboboxLabel class="app-palette__group">
            {{ section.label }}
          </ComboboxLabel>
          <ComboboxItem
              v-for="row in section.items"
              :key="listItemKey(row.item)"
              class="app-palette__item"
              :class="{ 'is-single': isSingleLineItem(row.item) }"
              :value="listItemKey(row.item)"
              @select.prevent="runItem(row.item)"
          >
            <template v-if="row.item.kind === 'object'">
              <span class="app-palette__label app-palette__label--mono">{{ row.item.entry.qualifiedLabel }}</span>
              <span class="app-palette__meta">
                {{ kindLabel(row.item.entry) }}
                <span class="app-palette__dot" aria-hidden="true"/>
                {{ row.item.entry.connectionLabel || '—' }}
                <template v-if="row.item.entry.owner">
                  <span class="app-palette__dot" aria-hidden="true"/>
                  {{ row.item.entry.owner }}
                </template>
                <template v-else-if="row.item.entry.subtitle">
                  <span class="app-palette__dot" aria-hidden="true"/>
                  {{ row.item.entry.subtitle }}
                </template>
                <template v-if="row.item.entry.source === 'discovery'">
                  <span class="app-palette__badge">{{ t('globalObjectSearch.discoveryBadge') }}</span>
                </template>
              </span>
            </template>
            <template v-else-if="row.item.kind === 'knowledge'">
              <span class="app-palette__label">{{ row.item.entry.term }}</span>
              <span v-if="knowledgeEntrySubtitle(row.item.entry)" class="app-palette__meta">
                {{ knowledgeEntrySubtitle(row.item.entry) }}
              </span>
            </template>
            <template v-else-if="row.item.kind === 'navigation'">
              <span class="app-palette__row">
                <span class="app-palette__label">{{ row.item.entry.label }}</span>
                <span v-if="row.item.entry.hint" class="app-palette__meta app-palette__meta--trail">
                  {{ row.item.entry.hint }}
                </span>
              </span>
            </template>
            <template v-else>
              <span class="app-palette__row">
                <span class="app-palette__label">{{ t(row.item.entry.labelKey) }}</span>
                <span v-if="commandBindingChips(row.item.entry.id).length" class="app-palette__keys">
                  <kbd
                      v-for="chip in commandBindingChips(row.item.entry.id)"
                      :key="chip"
                      class="app-palette__chip"
                  >{{ chip }}</kbd>
                </span>
              </span>
            </template>
          </ComboboxItem>
        </ComboboxGroup>
      </ComboboxViewport>
      <EmptyState v-else embedded compact :title="t('globalObjectSearch.empty')"/>
    </ComboboxRoot>
  </AppPalette>
</template>
