<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {SettingsSection} from '@/core/types'
import {DwIcon, DwSplitPane, EmptyState, SearchInput} from '@/core/components'
import {useDebouncedRef} from '@/core/utils/debounced-ref'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {resolveSettingsPanel} from '@/features/settings/settings-section-registry'
import {
  buildSettingsNavGroups,
  isAiSettingsSection,
} from '@/features/settings/constants/settings-nav.config'
import SettingsNavIcon from '@/features/settings/components/SettingsNavIcon.vue'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {isStandardEdition} from '@/features/pack/edition'
import {
  flashSettingsAnchor,
  searchSettingsIndex,
  type SettingsSearchHit,
} from '@/features/settings/services/settings-search-index'
import {ensureDeferredDwIcons} from '@/core/icons'

defineOptions({name: 'SettingsView'})

void ensureDeferredDwIcons()

/** PERF-07: align with explorer / global search (~200ms); clear flushes immediately. */
const SETTINGS_SEARCH_DEBOUNCE_MS = 180

const {t} = useI18n()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const auth = useAuthStore()
const entitlement = useEntitlementStore()

const searchQuery = ref('')
const debouncedSearchQuery = useDebouncedRef(searchQuery, SETTINGS_SEARCH_DEBOUNCE_MS, {
  flushImmediately: (q) => !q.trim(),
})
const searchHits = ref<SettingsSearchHit[]>([])
const lastSearchedQuery = ref('')
const searchSettled = computed(() => searchQuery.value === lastSearchedQuery.value)

const navGroups = computed(() => buildSettingsNavGroups({
  isAdmin: auth.isAdmin,
  platformAdmin: auth.platformAdmin,
  multiTenancy: auth.tenancyMode === 'multi',
  hideAiSections: isStandardEdition(),
}))

/** Flat Cursor-style list: all allowed items, no collapsible groups. */
const navItems = computed(() =>
    navGroups.value.flatMap((group) =>
        group.items.filter((item) => appConfig.canOpenSettingsSection(item.id)),
    ),
)

const allowedSections = computed(() => {
  const set = new Set<SettingsSection>()
  for (const item of navItems.value) set.add(item.id)
  return set
})

const activeSection = computed(() => layout.settingsSection)
const activePanel = computed(() => resolveSettingsPanel(activeSection.value))
const shellRef = ref<{ $el?: HTMLElement } | null>(null)

function scrollMainToTop() {
  const root = shellRef.value?.$el
  if (!root) return
  const main = root.classList?.contains('module-shell__main')
      ? root
      : root.querySelector<HTMLElement>('.module-shell__main')
  if (main) main.scrollTop = 0
}

watch(
    activeSection,
    (section) => {
      if (isStandardEdition() && isAiSettingsSection(section)) {
        const fallback = navItems.value[0]?.id ?? 'basic'
        layout.setSettingsSection(fallback)
        return
      }
      // 搜索锚点跳转留给 flashSettingsAnchor；普通切菜单时右栏置顶
      if (layout.settingsScrollAnchor) return
      void nextTick(() => scrollMainToTop())
    },
)

function runSettingsSearch(q: string) {
  lastSearchedQuery.value = q
  searchHits.value = searchSettingsIndex(q, {
    translate: (key) => t(key),
    allowedSections: allowedSections.value,
  }).slice(0, 8)
}

watch(debouncedSearchQuery, (q) => runSettingsSearch(q))

/** Enter: flush pending debounce so results match the typed query immediately. */
function onSearchEnter() {
  if (searchSettled.value) return
  runSettingsSearch(searchQuery.value)
}

function selectSection(section: SettingsSection, anchor?: string) {
  if (!appConfig.canOpenSettingsSection(section)) return
  if (isStandardEdition() && isAiSettingsSection(section)) {
    entitlement.openPaywall('pack.ai', 'settings.ai')
    return
  }
  if (anchor) {
    layout.openSettingsModule(section, anchor)
    void nextTick(() => flashSettingsAnchor(anchor))
  } else {
    layout.clearSettingsScrollAnchor()
    layout.setSettingsSection(section)
    void nextTick(() => scrollMainToTop())
  }
  searchQuery.value = ''
  searchHits.value = []
}

function onSearchHit(hit: SettingsSearchHit) {
  selectSection(hit.section, hit.anchorId)
}

function backToWorkspace() {
  layout.setModule('database')
}

const profileInitial = computed(() => {
  const name = (layout.profileName || '').trim()
  if (!name) return '?'
  return Array.from(name)[0]?.toUpperCase() ?? '?'
})

function openProfile() {
  selectSection('profile')
}
</script>

<template>
  <DwSplitPane
      ref="shellRef"
      class="module-shell module-shell--settings"
      storage-key="dw.split.settings-shell"
      default-ratio="sidebar"
      :default-width="252"
      :min-width="212"
      :max-width="360"
      :max-ratio="0.4"
      :end-min-width="360"
      :stack-below="false"
      start-class="module-shell__nav"
      end-class="module-shell__main module-shell__main--async-panel"
      handle-variant="line"
  >
    <template #start>
      <button class="module-shell__back" type="button" @click="backToWorkspace">
        <DwIcon name="chevron-left" size="sm" :stroke-width="2.2" aria-hidden="true"/>
        <span>{{ t('settings.backToWorkspace') }}</span>
      </button>
      <div class="settings-search">
        <SearchInput
            v-model="searchQuery"
            size="sm"
            :placeholder="t('settings.searchPlaceholder')"
            @keydown.enter.prevent="onSearchEnter"
        />
        <ul v-if="searchHits.length" class="settings-search__hits" role="listbox">
          <li
              v-for="hit in searchHits"
              :key="`${hit.section}-${hit.anchorId || 'root'}`"
          >
            <button type="button" @click="onSearchHit(hit)">
              <SettingsNavIcon :section="hit.section"/>
              <span>{{ t(hit.labelKey) }}</span>
            </button>
          </li>
        </ul>
        <EmptyState
            v-else-if="searchSettled && searchQuery.trim()"
            embedded
            compact
            class="settings-search__empty"
            :title="t('settings.searchEmpty')"
        />
      </div>
      <nav class="module-shell__nav-list" aria-label="settings">
        <button
            v-for="item in navItems"
            :key="item.id"
            class="module-shell__nav-item"
            :class="{'is-active': activeSection === item.id}"
            type="button"
            @click="selectSection(item.id)"
        >
          <span class="module-shell__nav-item-icon" aria-hidden="true">
            <SettingsNavIcon :section="item.id"/>
          </span>
          <span class="module-shell__nav-item-label">{{ t(item.labelKey) }}</span>
        </button>
      </nav>
      <div class="module-shell__profile">
        <button
            type="button"
            class="module-shell__profile-main"
            :class="{'is-active': activeSection === 'profile'}"
            :title="layout.profileName"
            @click="openProfile"
        >
          <span class="module-shell__profile-avatar" aria-hidden="true">{{ profileInitial }}</span>
          <span class="module-shell__profile-email">{{ layout.profileEmail }}</span>
        </button>
        <button
            type="button"
            class="module-shell__profile-gear"
            :aria-label="t('settings.nav.profile')"
            @click="openProfile"
        >
          <DwIcon name="settings" size="sm" :stroke-width="1.6" aria-hidden="true"/>
        </button>
      </div>
    </template>

    <template #end>
      <component :is="activePanel" v-if="activePanel"/>
    </template>
  </DwSplitPane>
</template>

<style scoped>
.settings-search {
  position: relative;
  padding: 0 0 var(--dw-space-3);
  flex-shrink: 0;
}

.settings-search__hits {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 20;
  margin: 4px 0 0;
  padding: var(--dw-space-1);
  list-style: none;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-shadow);
  max-height: 240px;
  overflow: auto;
}

.settings-search__hits button {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  width: 100%;
  appearance: none;
  border: 0;
  background: transparent;
  padding: 6px 8px;
  border-radius: var(--dw-radius-xs);
  text-align: left;
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
  cursor: pointer;
}

.settings-search__hits button:hover {
  background: var(--dw-bg-hover);
}

.settings-search__empty {
  margin: 6px 0 0;
  padding: 0;
  align-items: flex-start;
  text-align: left;
}

.settings-search__empty :deep(p) {
  font-size: var(--dw-text-xs);
  font-weight: 400;
  color: var(--dw-text-muted);
}
</style>

<style>
.settings-search-flash {
  animation: settings-search-flash 1.4s ease;
  outline: 2px solid color-mix(in srgb, var(--dw-accent) 55%, transparent);
  outline-offset: 4px;
  border-radius: var(--dw-control-radius);
}

@keyframes settings-search-flash {
  0% { outline-color: color-mix(in srgb, var(--dw-accent) 80%, transparent); }
  100% { outline-color: transparent; }
}
</style>
