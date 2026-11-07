<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DwPanelState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import CommunityPluginIcon from '@/features/community-plugin/components/CommunityPluginIcon.vue'
import SearchInput from '@/core/components/SearchInput.vue'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
import {
    assertDbTypeCategoriesComplete,
    categoryForDbType,
    DB_TYPE_CATEGORIES,
    type DbTypeCategoryKey,
} from '@/features/connection/constants/db-type-categories'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {fetchConnectorMarketBundle} from '@/features/datasource/services/connector-market.service'
import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'
import {installConnectorsWithDrivers} from '@/features/settings/services/install-connectors-with-drivers.service'
import {resolveDbTypesForPlugins} from '@/features/plugin/services/plugin-registry.service'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {createHttpCommunityPluginsApi, type CommunityPluginInfo} from '@/shared/api/http/community-plugins'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import type {DbType} from '@/core/types'

const emit = defineEmits<{
  select: [dbType: DbType]
}>()

const {t} = useI18n()
const pluginStore = usePluginStore()
const entitlement = useEntitlementStore()
const catalogStore = useDatasourceCatalogStore()
const layout = useLayoutStore()
const auth = useAuthStore()
const workspace = useWorkspaceStore()
const communityApi = createHttpCommunityPluginsApi()
const communityPlugins = ref<CommunityPluginInfo[]>([])
const marketEntries = ref<ConnectorMarketEntry[]>([])
const installingId = ref<string | null>(null)
const dbSearch = ref('')
const activeCategory = ref<DbTypeCategoryKey | 'all'>('sql')
const viewMode = ref<'grid' | 'list'>('grid')

type CommunityProviderCard = {
  key: string
  pluginId: string
  providerId: string
  label: string
  pluginName: string
}

type InstallableCard = {
  id: DbType
  label: string
}

const communityProviders = computed(() => {
  const out: CommunityProviderCard[] = []
  for (const plugin of communityPlugins.value) {
    if (!plugin.compatibility?.compatible) continue
    const contributions = (plugin.manifest.contributions || []) as Array<{
      type?: string
      id?: string
      label?: string
    }>
    for (const c of contributions) {
      if (c.type !== 'connection-provider' || !c.id) continue
      out.push({
        key: `${plugin.manifest.id}:${c.id}`,
        pluginId: plugin.manifest.id,
        providerId: c.id,
        label: c.label || c.id,
        pluginName: plugin.manifest.name,
      })
    }
  }
  return out
})

onMounted(() => {
  void catalogStore.ensureLoaded().catch(() => undefined)
  void refreshMarket()
  void refreshCommunityPlugins()
  window.addEventListener('dw-community-plugin-changed', refreshCommunityPlugins)
})

onUnmounted(() => {
  window.removeEventListener('dw-community-plugin-changed', refreshCommunityPlugins)
})

function refreshCommunityPlugins() {
  return communityApi.list().then((list) => {
    communityPlugins.value = list
  }).catch(() => {
    communityPlugins.value = []
  })
}

async function refreshMarket() {
  try {
    const bundle = await fetchConnectorMarketBundle()
    marketEntries.value = bundle.connectors
  } catch {
    marketEntries.value = []
  }
}

const availableDbTypes = computed(() =>
    resolveDbTypesForPlugins(
        catalogStore.ids as DbType[],
        (id) => pluginStore.isEnabled(id),
    ),
)

/**
 * Not yet loaded, but marketplace can download + hot-reload (install & continue).
 * Remote install API requires tenant admin / runtime-scoped token — hide for others.
 */
const installableTypes = computed((): InstallableCard[] => {
  if (!auth.isAdmin) return []
  const available = new Set(availableDbTypes.value)
  const candidates = marketEntries.value
      .filter((entry) => !entry.available && Boolean(entry.downloadUrl?.trim()))
      .map((entry) => entry.id as DbType)
      .filter((id) => !available.has(id))
  const allowed = new Set(
      resolveDbTypesForPlugins(candidates, (id) => pluginStore.isEnabled(id)),
  )
  return marketEntries.value
      .filter((entry) => allowed.has(entry.id as DbType))
      .map((entry) => ({id: entry.id as DbType, label: entry.label || entry.id}))
})

watch(
    availableDbTypes,
    (types) => {
      if (import.meta.env.DEV && types.length) {
        try {
          assertDbTypeCategoriesComplete(types)
        } catch (err) {
          console.warn('[DbTypeContextPanel]', err)
        }
      }
    },
    {immediate: true},
)

function labelFor(dbType: DbType) {
  return (
    catalogStore.items.find((item) => item.id === dbType)?.label
    ?? installableTypes.value.find((item) => item.id === dbType)?.label
    ?? dbType
  )
}

function matchesQuery(dbType: DbType) {
  const q = dbSearch.value.trim().toLowerCase()
  if (!q) return true
  return labelFor(dbType).toLowerCase().includes(q) || dbType.toLowerCase().includes(q)
}

const searchActive = computed(() => dbSearch.value.trim().length > 0)

/** Categories that currently have at least one available or installable type */
const visibleCategories = computed(() =>
    DB_TYPE_CATEGORIES.filter((cat) => {
      if (cat.key === 'plugins') return communityProviders.value.length > 0
      const inAvailable = availableDbTypes.value.some((dbType) => categoryForDbType(dbType) === cat.key)
      const inInstallable = installableTypes.value.some((card) => categoryForDbType(card.id) === cat.key)
      return inAvailable || inInstallable
    }),
)

watch(
    visibleCategories,
    (cats) => {
      if (activeCategory.value === 'all') return
      if (!cats.some((c) => c.key === activeCategory.value)) {
        activeCategory.value = cats[0]?.key ?? 'all'
      }
    },
    {immediate: true},
)

const filteredTypes = computed(() => {
  if (activeCategory.value === 'plugins' && !searchActive.value) return []
  let list = availableDbTypes.value.filter(matchesQuery)
  if (!searchActive.value && activeCategory.value !== 'all') {
    list = list.filter((dbType) => categoryForDbType(dbType) === activeCategory.value)
  }
  return list
})

const filteredInstallable = computed(() => {
  if (activeCategory.value === 'plugins' && !searchActive.value) return []
  let list = installableTypes.value.filter((card) => matchesQuery(card.id))
  if (!searchActive.value && activeCategory.value !== 'all') {
    list = list.filter((card) => categoryForDbType(card.id) === activeCategory.value)
  }
  return list
})

const filteredCommunityProviders = computed(() => {
  const q = dbSearch.value.trim().toLowerCase()
  if (!searchActive.value && activeCategory.value !== 'plugins') return []
  return communityProviders.value.filter((p) => {
    if (!q) return true
    return (
      p.label.toLowerCase().includes(q)
      || p.pluginName.toLowerCase().includes(q)
      || p.pluginId.toLowerCase().includes(q)
    )
  })
})

const hasDbResults = computed(
  () =>
    filteredTypes.value.length > 0
    || filteredInstallable.value.length > 0
    || filteredCommunityProviders.value.length > 0,
)

function isLocked(dbType: DbType) {
  return !entitlement.isDbTypeAllowed(dbType)
}

function onSelect(dbType: DbType) {
  if (!entitlement.guardDbType(dbType)) return
  emit('select', dbType)
}

async function onInstallAndContinue(card: InstallableCard) {
  if (installingId.value) return
  if (!entitlement.guardDbType(card.id)) return
  installingId.value = card.id
  layout.showToast(t('explorer.dbTypeInstalling', {type: card.label}), {variant: 'info'})
  try {
    await installConnectorsWithDrivers([card.id], {withDrivers: true})
    catalogStore.loaded = false
    await catalogStore.ensureLoaded().catch(() => undefined)
    await refreshMarket()
    layout.showSuccessToast(t('explorer.dbTypeInstallDone', {type: card.label}))
    emit('select', card.id)
  } catch (error) {
    layout.showErrorToast(
      resolveDisplayApiErrorMessage(error, t) || t('explorer.dbTypeInstallFailed'),
    )
  } finally {
    installingId.value = null
  }
}

function onSelectCommunityProvider(card: CommunityProviderCard) {
  workspace.openConnectionForm('plugin', {
    pluginId: card.pluginId,
    pluginConnectionProvider: card.providerId,
    connectionName: card.label,
  })
}

async function onTrial(dbType: DbType) {
  const packId = entitlement.packForDbType(dbType)
  if (!packId) return
  try {
    await entitlement.startTrial(packId)
    emit('select', dbType)
  } catch {
    entitlement.guardDbType(dbType)
  }
}

function selectCategory(key: DbTypeCategoryKey | 'all') {
  activeCategory.value = key
  if (key !== 'all') {
    dbSearch.value = ''
  }
}
</script>

<template>
  <div class="db-type-panel" :class="`is-${viewMode}`" @click.stop>
    <header class="db-type-panel__toolbar">
      <div class="db-type-panel__view-toggle" role="group" :aria-label="t('explorer.dbTypeViewMode')">
        <button
            type="button"
            class="db-type-panel__view-btn"
            :class="{'is-active': viewMode === 'grid'}"
            :title="t('explorer.dbTypeViewGrid')"
            :aria-pressed="viewMode === 'grid'"
            @click="viewMode = 'grid'"
        >
            <DwIcon name="menu-group" size="sm" :stroke-width="2"/>
        </button>
        <button
            type="button"
            class="db-type-panel__view-btn"
            :class="{'is-active': viewMode === 'list'}"
            :title="t('explorer.dbTypeViewList')"
            :aria-pressed="viewMode === 'list'"
            @click="viewMode = 'list'"
        >
          <DwIcon name="list-ordered" size="sm" :stroke-width="2"/>
        </button>
      </div>

      <div class="db-type-panel__search">
        <SearchInput
            v-model="dbSearch"
            size="sm"
            :placeholder="t('explorer.searchDbType')"
        />
      </div>

      <span
          class="db-type-panel__count"
          :title="t('explorer.pickDbType')"
      >
        {{ availableDbTypes.length + installableTypes.length }}
      </span>
    </header>

    <div class="db-type-panel__main">
      <nav
          v-if="!searchActive"
          class="db-type-panel__nav"
          :aria-label="t('explorer.dbTypeCategoryNav')"
      >
        <button
            v-for="cat in visibleCategories"
            :key="cat.key"
            type="button"
            class="db-type-panel__nav-item"
            :class="{'is-active': activeCategory === cat.key}"
            :aria-current="activeCategory === cat.key ? 'page' : undefined"
            @click="selectCategory(cat.key)"
        >
          {{ t(cat.titleKey) }}
        </button>
      </nav>

      <div class="db-type-panel__body">
        <DwPanelState
            v-if="catalogStore.loading"
            status="loading"
            :message="t('explorer.dbTypeLoading')"
            compact
        />
        <DwPanelState
            v-else-if="catalogStore.error"
            status="error"
            :message="t('explorer.dbTypeLoadFailed')"
            compact
        />
        <div
            v-else-if="hasDbResults"
            class="db-type-panel__cards"
            :class="`is-${viewMode}`"
        >
          <button
              v-for="dbType in filteredTypes"
              :key="dbType"
              class="db-type-panel__card"
              :class="{'is-locked': isLocked(dbType), 'is-list': viewMode === 'list'}"
              type="button"
              @click="onSelect(dbType)"
          >
            <span class="db-type-panel__card-icon" aria-hidden="true">
              <DbTypeIcon
                  :db-type="dbType"
                  :size="viewMode === 'grid' ? DB_TYPE_ICON_SIZE.gallery : DB_TYPE_ICON_SIZE.list"
              />
            </span>
            <span class="db-type-panel__card-label">{{ labelFor(dbType) }}</span>
            <span
                v-if="isLocked(dbType)"
                class="db-type-panel__trial"
                @click.stop="onTrial(dbType)"
            >
              {{ t('explorer.dbTypeTrial') }}
            </span>
            <DwIcon
                v-if="isLocked(dbType)"
                class="db-type-panel__lock"
                name="lock"
                size="xs"
                :stroke-width="2"
            />
          </button>
          <button
              v-for="card in filteredInstallable"
              :key="`install-${card.id}`"
              class="db-type-panel__card is-installable"
              :class="{
                'is-locked': isLocked(card.id),
                'is-list': viewMode === 'list',
                'is-installing': installingId === card.id,
              }"
              type="button"
              :disabled="Boolean(installingId)"
              :title="t('explorer.dbTypeInstallContinueHint', {type: card.label})"
              @click="onInstallAndContinue(card)"
          >
            <span class="db-type-panel__card-icon" aria-hidden="true">
              <DbTypeIcon
                  :db-type="card.id"
                  :size="viewMode === 'grid' ? DB_TYPE_ICON_SIZE.gallery : DB_TYPE_ICON_SIZE.list"
              />
            </span>
            <span class="db-type-panel__card-label">{{ card.label }}</span>
            <span class="db-type-panel__trial db-type-panel__install">
              {{
                installingId === card.id
                  ? t('explorer.dbTypeInstallingShort')
                  : t('explorer.dbTypeInstallContinue')
              }}
            </span>
            <DwIcon
                v-if="isLocked(card.id)"
                class="db-type-panel__lock"
                name="lock"
                size="xs"
                :stroke-width="2"
            />
          </button>
          <button
              v-for="card in filteredCommunityProviders"
              :key="card.key"
              class="db-type-panel__card"
              :class="{'is-list': viewMode === 'list'}"
              type="button"
              @click="onSelectCommunityProvider(card)"
          >
            <span class="db-type-panel__card-icon" aria-hidden="true">
              <CommunityPluginIcon
                  :plugin-id="card.pluginId"
                  fallback="plugins"
                  :size="viewMode === 'grid' ? 'md' : 'sm'"
              />
            </span>
            <span class="db-type-panel__card-label">{{ card.label }}</span>
            <span class="db-type-panel__trial" style="pointer-events:none;opacity:0.7">{{ card.pluginName }}</span>
          </button>
        </div>
        <DwPanelState
            v-else
            status="empty"
            :message="t('explorer.dbTypeNotFound')"
            compact
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.db-type-panel {
  width: min(560px, 86vw);
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: min(440px, 70vh);
}

.db-type-panel__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-text) 8%, transparent);
}

.db-type-panel__view-toggle {
  display: inline-flex;
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--dw-text) 10%, transparent);
  border-radius: var(--dw-menu-item-radius);
  overflow: hidden;
}

.db-type-panel__view-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--dw-density-sm);
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.db-type-panel__view-btn + .db-type-panel__view-btn {
  border-left: 1px solid color-mix(in srgb, var(--dw-text) 10%, transparent);
}

.db-type-panel__view-btn.is-active {
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
  color: var(--dw-text);
}

.db-type-panel__search {
  flex: 1;
  min-width: 0;
}

.db-type-panel__search :deep(.dw-search) {
  height: var(--dw-density-sm);
  border: 1px solid color-mix(in srgb, var(--dw-text) 10%, transparent);
  border-radius: var(--dw-menu-item-radius);
  background: color-mix(in srgb, var(--dw-text) 5%, transparent);
}

.db-type-panel__search :deep(.dw-search:focus-within) {
  border-color: color-mix(in srgb, var(--dw-primary) 45%, transparent);
}

.db-type-panel__search :deep(.dw-search input) {
  font-size: var(--dw-text-sm);
}

.db-type-panel__count {
  flex-shrink: 0;
  min-width: 22px;
  height: 20px;
  padding: 0 7px;
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  line-height: 20px;
  text-align: center;
}

.db-type-panel__main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.db-type-panel__nav {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 128px;
  padding: 6px 4px 8px 6px;
  overflow-y: auto;
  border-right: 1px solid color-mix(in srgb, var(--dw-text) 8%, transparent);
  gap: 1px;
}

.db-type-panel__nav-item {
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: var(--dw-menu-item-radius);
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  line-height: 1.3;
}

.db-type-panel__nav-item:hover {
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  color: var(--dw-text);
}

.db-type-panel__nav-item.is-active {
  background: color-mix(in srgb, var(--dw-text) 10%, transparent);
  color: var(--dw-text);
  font-weight: 600;
}

.db-type-panel__body {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 8px;
}

.db-type-panel__cards.is-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}

.db-type-panel__cards.is-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.db-type-panel__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 88px;
  padding: 12px 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--dw-panel-radius);
  background: transparent;
  color: var(--dw-text);
  cursor: pointer;
  transition: background 100ms ease, border-color 100ms ease;
}

.db-type-panel__card:hover {
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  border-color: color-mix(in srgb, var(--dw-text) 12%, transparent);
}

.db-type-panel__card.is-list {
  flex-direction: row;
  justify-content: flex-start;
  min-height: var(--dw-menu-item-h);
  padding: 0 8px 0 4px;
  border-radius: var(--dw-menu-item-radius);
  gap: 0;
}

.db-type-panel__card.is-list:hover {
  background: var(--dw-menu-active);
  border-color: transparent;
}

.db-type-panel__card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.db-type-panel__card.is-list .db-type-panel__card-icon {
  width: var(--dw-menu-gutter);
}

.db-type-panel__card-label {
  max-width: 100%;
  font-size: var(--dw-text-sm);
  font-weight: 500;
  line-height: 1.25;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.db-type-panel__card.is-list .db-type-panel__card-label {
  flex: 1;
  min-width: 0;
  font-size: var(--dw-text-md);
  font-weight: 400;
  text-align: left;
}

.db-type-panel__card.is-locked .db-type-panel__card-label {
  color: var(--dw-text-secondary);
}

.db-type-panel__trial {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: var(--dw-menu-item-radius);
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  line-height: 1.5;
}

.db-type-panel__trial:hover {
  background: color-mix(in srgb, var(--dw-primary) 24%, transparent);
}

.db-type-panel__lock {
  flex-shrink: 0;
  color: var(--dw-text-muted);
}

.db-type-panel__card:not(.is-list).is-locked {
  position: relative;
}

.db-type-panel__card:not(.is-list).is-locked .db-type-panel__lock {
  position: absolute;
  top: 8px;
  right: 8px;
}

.db-type-panel__card:not(.is-list) .db-type-panel__trial {
  font-size: var(--dw-font-size-badge);
}

.db-type-panel__card.is-installable {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--dw-primary) 28%, transparent);
}

.db-type-panel__card.is-installing {
  opacity: 0.72;
  cursor: wait;
}

.db-type-panel__install {
  background: color-mix(in srgb, var(--dw-primary) 18%, transparent);
}
</style>
