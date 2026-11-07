<script setup lang="ts">
import {ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {EmptyState} from '@/core/components'
import type {CommunityPluginInfo} from '@/shared/api/http/community-plugins'
import type {MarketplaceListItem} from '@/features/community-plugin/composables/useCommunityPluginCenter'
import CommunityPluginIcon from '@/features/community-plugin/components/CommunityPluginIcon.vue'

defineProps<{
  searchQuery: string
  installed: CommunityPluginInfo[]
  storeItems: MarketplaceListItem[]
  selectedId: string
  selectedStoreKey: string
  loading: boolean
  pluginName: (plugin: CommunityPluginInfo) => string
  pluginMeta: (plugin: CommunityPluginInfo) => string
  storeEntryName: (item: MarketplaceListItem) => string
  catalogSourceLabel: (source?: string) => string
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  selectInstalled: [pluginId: string]
  selectStore: [item: MarketplaceListItem]
  openInstall: []
}>()

const {t} = useI18n()

type ListViewMode = 'list' | 'card'
const VIEW_MODE_KEY = 'datawise-community-plugin-list-view'

function readViewMode(): ListViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'card' ? 'card' : 'list'
  } catch {
    return 'list'
  }
}

const viewMode = ref<ListViewMode>(readViewMode())

watch(viewMode, (mode) => {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <aside class="community-plugin-list-pane" :data-view="viewMode">
    <div class="community-plugin-list-pane__toolbar">
      <div class="community-plugin-list-pane__search">
        <DwIcon name="search" size="sm" class="community-plugin-list-pane__search-icon" aria-hidden="true"/>
        <input
            class="community-plugin-list-pane__search-input"
            type="search"
            :value="searchQuery"
            :placeholder="t('communityPlugin.searchPlaceholder')"
            @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        >
      </div>
      <div
          class="community-plugin-list-pane__view-switch"
          role="group"
          :aria-label="t('communityPlugin.viewMode.label')"
      >
        <button
            type="button"
            class="community-plugin-list-pane__view-btn"
            :class="{'is-active': viewMode === 'list'}"
            :aria-pressed="viewMode === 'list'"
            :title="t('communityPlugin.viewMode.list')"
            @click="viewMode = 'list'"
        >
          <DwIcon name="list" size="sm" aria-hidden="true"/>
        </button>
        <button
            type="button"
            class="community-plugin-list-pane__view-btn"
            :class="{'is-active': viewMode === 'card'}"
            :aria-pressed="viewMode === 'card'"
            :title="t('communityPlugin.viewMode.card')"
            @click="viewMode = 'card'"
        >
          <DwIcon name="grid" size="sm" aria-hidden="true"/>
        </button>
      </div>
    </div>

    <div class="community-plugin-list-pane__scroll">
      <section
          class="community-plugin-list-group"
          :class="{'is-cards': viewMode === 'card'}"
      >
        <h3 class="community-plugin-list-group__title">
          {{ t('communityPlugin.installedList') }}
          <span class="community-plugin-list-group__count">{{ installed.length }}</span>
        </h3>
        <button
            v-for="plugin in installed"
            :key="plugin.manifest.id"
            type="button"
            class="community-plugin-list-row"
            :class="{
              'is-active': selectedId === plugin.manifest.id && !selectedStoreKey,
              'is-incompatible': !plugin.compatibility?.compatible,
            }"
            @click="emit('selectInstalled', plugin.manifest.id)"
        >
          <CommunityPluginIcon
              class="community-plugin-list-row__icon"
              :plugin="plugin"
              :size="viewMode === 'card' ? 'md' : 'sm'"
          />
          <span class="community-plugin-list-row__body">
            <span class="community-plugin-list-row__name">{{ pluginName(plugin) }}</span>
            <span class="community-plugin-list-row__meta">{{ pluginMeta(plugin) }}</span>
          </span>
          <span
              v-if="!plugin.compatibility?.compatible"
              class="community-plugin-list-row__badge is-bad"
          >
            {{ t('communityPlugin.incompatible') }}
          </span>
        </button>
        <EmptyState
            v-if="!loading && !installed.length"
            class="community-plugin-list-group__empty"
            embedded
            :title="t('communityPlugin.emptyInstalled')"
            :hint="t('communityPlugin.emptyInstalledHint')"
        >
          <template #actions>
            <button type="button" class="community-plugin-text-action" @click="emit('openInstall')">
              {{ t('communityPlugin.installLocal') }}
            </button>
          </template>
        </EmptyState>
      </section>

      <section
          class="community-plugin-list-group"
          :class="{'is-cards': viewMode === 'card'}"
      >
        <h3 class="community-plugin-list-group__title">
          {{ t('communityPlugin.marketplaceTitle') }}
          <span class="community-plugin-list-group__count">{{ storeItems.length }}</span>
        </h3>
        <button
            v-for="item in storeItems"
            :key="`${item.catalogId}:${item.entry.id}`"
            type="button"
            class="community-plugin-list-row"
            :class="{
              'is-active': selectedStoreKey === `${item.catalogId}:${item.entry.id}`,
            }"
            @click="emit('selectStore', item)"
        >
          <CommunityPluginIcon
              class="community-plugin-list-row__icon"
              :plugin-id="item.entry.status === 'installed' ? item.entry.id : ''"
              :size="viewMode === 'card' ? 'md' : 'sm'"
          />
          <span class="community-plugin-list-row__body">
            <span class="community-plugin-list-row__name">{{ storeEntryName(item) }}</span>
            <span class="community-plugin-list-row__meta">
              v{{ item.entry.version }}
              <template v-if="catalogSourceLabel(item.source)">
                · {{ catalogSourceLabel(item.source) }}
              </template>
            </span>
          </span>
          <span
              class="community-plugin-list-row__badge"
              :class="item.entry.status === 'installed' ? 'is-ok' : 'is-muted'"
          >
            {{ item.entry.status === 'installed'
              ? t('communityPlugin.marketStatus.installed')
              : t('communityPlugin.marketStatus.available') }}
          </span>
        </button>
        <EmptyState
            v-if="!loading && !storeItems.length"
            embedded
            compact
            class="community-plugin-list-pane__empty-hint community-plugin-list-group__empty"
            :title="t('communityPlugin.marketplacePlaceholder')"
        />
      </section>
    </div>
  </aside>
</template>
