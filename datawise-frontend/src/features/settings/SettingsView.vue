<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {SettingsSection} from '@/core/types'
import {DwIcon, DwInput, DwSplitPane, EmptyState} from '@/core/components'
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

/** v3: quiet section headers; default all expanded. */
const NAV_COLLAPSE_KEY = 'dw.settings.nav.collapsed.v3'

const {t} = useI18n()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const auth = useAuthStore()
const entitlement = useEntitlementStore()

const searchQuery = ref('')
const searchHits = ref<SettingsSearchHit[]>([])
const collapseHydrated = ref(false)

const navGroups = computed(() => buildSettingsNavGroups({
  isAdmin: auth.isAdmin,
  platformAdmin: auth.platformAdmin,
  multiTenancy: auth.tenancyMode === 'multi',
  hideAiSections: isStandardEdition(),
}))

const visibleNavGroups = computed(() =>
    navGroups.value
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => appConfig.canOpenSettingsSection(item.id)),
        }))
        .filter((group) => group.items.length > 0),
)

const allowedSections = computed(() => {
  const set = new Set<SettingsSection>()
  for (const group of visibleNavGroups.value) {
    for (const item of group.items) set.add(item.id)
  }
  return set
})

const activeSection = computed(() => layout.settingsSection)
const activePanel = computed(() => resolveSettingsPanel(activeSection.value))

/** Collapsed group labelKeys */
const collapsedGroups = ref<Set<string>>(new Set())

function readStoredCollapsed(): Set<string> | null {
  try {
    const raw = localStorage.getItem(NAV_COLLAPSE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return new Set(parsed.filter((k): k is string => typeof k === 'string'))
  } catch {
    return null
  }
}

function persistCollapsed() {
  try {
    localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify([...collapsedGroups.value]))
  } catch {
    /* ignore */
  }
}

function hydrateCollapseState() {
  if (collapseHydrated.value) return
  if (!visibleNavGroups.value.length) return
  const stored = readStoredCollapsed()
  if (stored) {
    const known = new Set(visibleNavGroups.value.map((g) => g.labelKey))
    collapsedGroups.value = new Set([...stored].filter((k) => known.has(k)))
  } else {
    // First visit: keep all sections open — collapse is opt-in.
    collapsedGroups.value = new Set()
  }
  collapseHydrated.value = true
  persistCollapsed()
}

function isGroupCollapsed(labelKey: string): boolean {
  return collapsedGroups.value.has(labelKey)
}

function toggleGroup(labelKey: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(labelKey)) next.delete(labelKey)
  else next.add(labelKey)
  collapsedGroups.value = next
  persistCollapsed()
}

function expandGroupForSection(section: SettingsSection) {
  const group = visibleNavGroups.value.find((g) => g.items.some((item) => item.id === section))
  if (!group) return
  if (!collapsedGroups.value.has(group.labelKey)) return
  const next = new Set(collapsedGroups.value)
  next.delete(group.labelKey)
  collapsedGroups.value = next
  persistCollapsed()
}

function groupContainsActive(labelKey: string): boolean {
  const group = visibleNavGroups.value.find((g) => g.labelKey === labelKey)
  return Boolean(group?.items.some((item) => item.id === activeSection.value))
}

watch(
    visibleNavGroups,
    () => hydrateCollapseState(),
    {immediate: true},
)

watch(
    activeSection,
    (section) => {
      if (!isStandardEdition() || !isAiSettingsSection(section)) {
        expandGroupForSection(section)
        return
      }
      const fallback = visibleNavGroups.value[0]?.items[0]?.id ?? 'basic'
      layout.setSettingsSection(fallback)
    },
    {immediate: true},
)

watch(searchQuery, (q) => {
  searchHits.value = searchSettingsIndex(q, {
    translate: (key) => t(key),
    allowedSections: allowedSections.value,
  }).slice(0, 8)
  // Searching: expand all so hits are reachable via list + dropdown still works.
  if (q.trim() && collapseHydrated.value) {
    collapsedGroups.value = new Set()
  }
})

function selectSection(section: SettingsSection, anchor?: string) {
  if (!appConfig.canOpenSettingsSection(section)) return
  if (isStandardEdition() && isAiSettingsSection(section)) {
    entitlement.openPaywall('pack.ai', 'settings.ai')
    return
  }
  layout.setSettingsSection(section)
  expandGroupForSection(section)
  if (anchor) {
    layout.openSettingsModule(section, anchor)
    void nextTick(() => flashSettingsAnchor(anchor))
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

/** Collapsed header click: expand; if already has active, also a no-op expand. */
function onGroupHeaderClick(labelKey: string) {
  toggleGroup(labelKey)
}
</script>

<template>
  <DwSplitPane
      class="module-shell"
      storage-key="dw.split.settings-shell"
      default-ratio="sidebar"
      :default-width="220"
      :min-width="180"
      :max-width="360"
      :max-ratio="0.4"
      :end-min-width="360"
      :stack-below="false"
      start-class="module-shell__nav"
      end-class="module-shell__main module-shell__main--async-panel"
      handle-variant="line"
  >
    <template #start>
      <h1 class="module-shell__nav-title">{{ t('settings.title') }}</h1>
      <div class="settings-search">
        <DwInput
            v-model="searchQuery"
            type="search"
            :placeholder="t('settings.searchPlaceholder')"
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
            v-else-if="searchQuery.trim()"
            embedded
            compact
            class="settings-search__empty"
            :title="t('settings.searchEmpty')"
        />
      </div>
      <nav class="module-shell__nav-list" aria-label="settings">
        <section
            v-for="group in visibleNavGroups"
            :key="group.labelKey"
            class="module-shell__nav-group"
            :class="{
              'is-collapsed': isGroupCollapsed(group.labelKey),
              'has-active': groupContainsActive(group.labelKey),
            }"
        >
          <button
              type="button"
              class="module-shell__nav-group-toggle"
              :aria-expanded="!isGroupCollapsed(group.labelKey)"
              @click="onGroupHeaderClick(group.labelKey)"
          >
            <DwIcon
                name="chevron-down"
                class="module-shell__nav-group-toggle__chevron"
                size="sm"
                :stroke-width="2.2"
            />
            <span class="module-shell__nav-group-toggle__label">{{ t(group.labelKey) }}</span>
            <span class="module-shell__nav-group-toggle__count" aria-hidden="true">
              {{ group.items.length }}
            </span>
          </button>
          <div
              v-show="!isGroupCollapsed(group.labelKey)"
              class="module-shell__nav-group__items"
              role="group"
              :aria-label="t(group.labelKey)"
          >
            <button
                v-for="item in group.items"
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
          </div>
        </section>
      </nav>
      <button class="module-shell__back" type="button" @click="backToWorkspace">
        {{ t('settings.backToWorkspace') }}
      </button>
    </template>

    <template #end>
      <component :is="activePanel" v-if="activePanel"/>
    </template>
  </DwSplitPane>
</template>

<style scoped>
.settings-search {
  position: relative;
  padding: 0 var(--dw-space-4) var(--dw-space-3);
  flex-shrink: 0;
}

.settings-search__hits {
  position: absolute;
  left: var(--dw-space-4);
  right: var(--dw-space-4);
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
