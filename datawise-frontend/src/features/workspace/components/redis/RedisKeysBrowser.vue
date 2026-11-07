<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState, SearchInput} from '@/core/components'
import {explorerApi} from '@/api'
import {useDebouncedRef} from '@/core/utils/debounced-ref'
import {
    derivePrefixPatterns,
    filterRedisKeys,
    groupRedisKeysByPrefix,
    type RedisKeyPrefixGroup,
} from '@/features/explorer/services/redis-key-prefix.service'
import {
    normalizeRedisScanPattern,
    REDIS_KEYS_PAGE_SIZE,
} from '@/features/explorer/services/redis-keys-scan.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
    connectionId: string
    database?: number
    selectedKey?: string | null
    /** 嵌入圆角卡片内时去掉外层底色与硬边框 */
    embedded?: boolean
}>()

const emit = defineEmits<{
    select: [key: string]
    open: [key: string]
    stats: [payload: { dbSize: number | null; loaded: number }]
}>()

const {t} = useI18n()

const patternInput = ref('*')
const localFilter = ref('')
const debouncedLocalFilter = useDebouncedRef(localFilter, 200)
const keys = ref<string[]>([])
const cursor = ref<string | null>(null)
const hasMore = ref(false)
const dbSize = ref<number | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const activePrefix = ref<string | null>(null)
/** Prefix groups the user has expanded; all groups start collapsed. */
const expandedPrefixes = ref<Set<string>>(new Set())
/** Groups that have expanded past the first virtual page of keys */
const expandedKeyGroups = ref<Set<string>>(new Set())

const REDIS_PREFIX_NAV_LIMIT = 6
const REDIS_KEYS_VIRTUAL_PAGE = 150

const filteredKeys = computed(() => filterRedisKeys(keys.value, debouncedLocalFilter.value))

const prefixGroups = computed((): RedisKeyPrefixGroup[] => {
    const groups = groupRedisKeysByPrefix(filteredKeys.value)
    if (!activePrefix.value) return groups
    return groups.filter((group) => group.prefix === activePrefix.value)
})

const dynamicPresets = computed(() => derivePrefixPatterns(keys.value, 6))

/** Already sorted by count desc in groupRedisKeysByPrefix */
const prefixNav = computed(() => groupRedisKeysByPrefix(keys.value))

const prefixNavExpanded = ref(false)

const visiblePrefixNav = computed(() => {
    const groups = prefixNav.value
    if (prefixNavExpanded.value || groups.length <= REDIS_PREFIX_NAV_LIMIT) return groups
    const top = groups.slice(0, REDIS_PREFIX_NAV_LIMIT)
    if (activePrefix.value && !top.some((group) => group.prefix === activePrefix.value)) {
        const active = groups.find((group) => group.prefix === activePrefix.value)
        if (active) return [...top.slice(0, REDIS_PREFIX_NAV_LIMIT - 1), active]
    }
    return top
})

const statusText = computed(() => {
    if (loading.value) return t('explorer.redisBrowser.loading')
    if (error.value) return error.value
    const loaded = keys.value.length
    const shown = filteredKeys.value.length
    const total = dbSize.value
    if (localFilter.value.trim()) {
        return t('explorer.redisBrowser.statusFiltered', {shown, loaded})
    }
    if (total != null) {
        return t('explorer.redisBrowser.statusWithDbSize', {loaded, total})
    }
    return t('explorer.redisBrowser.status', {count: loaded})
})

function visibleKeysForGroup(group: RedisKeyPrefixGroup): string[] {
    if (expandedKeyGroups.value.has(group.prefix) || group.keys.length <= REDIS_KEYS_VIRTUAL_PAGE) {
        return group.keys
    }
    return group.keys.slice(0, REDIS_KEYS_VIRTUAL_PAGE)
}

function groupHasMoreKeys(group: RedisKeyPrefixGroup): boolean {
    return group.keys.length > REDIS_KEYS_VIRTUAL_PAGE && !expandedKeyGroups.value.has(group.prefix)
}

function expandGroupKeys(prefix: string) {
    const next = new Set(expandedKeyGroups.value)
    next.add(prefix)
    expandedKeyGroups.value = next
}

function emitStats() {
    emit('stats', {dbSize: dbSize.value, loaded: keys.value.length})
}

async function scanKeys(reset: boolean) {
    if (!props.connectionId) return
    if (reset) {
        loading.value = true
        cursor.value = null
        keys.value = []
        hasMore.value = false
        error.value = null
        activePrefix.value = null
        expandedPrefixes.value = new Set()
        expandedKeyGroups.value = new Set()
        prefixNavExpanded.value = false
    } else {
        loadingMore.value = true
    }

    try {
        const result = await explorerApi.fetchRedisKeysScan(props.connectionId, {
            pattern: normalizeRedisScanPattern(patternInput.value),
            cursor: reset ? undefined : cursor.value ?? undefined,
            count: REDIS_KEYS_PAGE_SIZE,
            database: props.database,
        })
        if (reset) {
            keys.value = [...result.keys]
        } else {
            keys.value = [...keys.value, ...result.keys]
        }
        cursor.value = result.cursor
        hasMore.value = result.hasMore
        dbSize.value = result.dbSize
        emitStats()
    } catch (err) {
        error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.redisKey.loadFailed')
    } finally {
        loading.value = false
        loadingMore.value = false
    }
}

function onSearch() {
    void scanKeys(true)
}

function onPresetClick(pattern: string) {
    patternInput.value = pattern
    activePrefix.value = null
    void scanKeys(true)
}

function onPrefixNavClick(group: RedisKeyPrefixGroup) {
    if (activePrefix.value === group.prefix) {
        activePrefix.value = null
        return
    }
    activePrefix.value = group.prefix
}

function toggleGroup(prefix: string) {
    const next = new Set(expandedPrefixes.value)
    if (next.has(prefix)) next.delete(prefix)
    else next.add(prefix)
    expandedPrefixes.value = next
}

function isGroupCollapsed(prefix: string) {
    // Single group has no header row — keep keys visible.
    if (prefixGroups.value.length <= 1) return false
    return !expandedPrefixes.value.has(prefix)
}

function onKeyClick(key: string) {
    emit('select', key)
}

function onKeyDblClick(key: string) {
    emit('open', key)
}

function prefixLabel(group: RedisKeyPrefixGroup) {
    return group.prefix === '__no_prefix__' ? t('explorer.redisBrowser.noPrefix') : group.label
}

watch(
    () => [props.connectionId, props.database] as const,
    () => {
        patternInput.value = '*'
        localFilter.value = ''
        void scanKeys(true)
    },
)

onMounted(() => {
    void scanKeys(true)
})

defineExpose({refresh: () => scanKeys(true)})
</script>

<template>
  <div class="connector-list redis-keys-browser" :class="{ 'is-embedded': embedded }">
    <div class="connector-list__filters connector-list__filters--services">
      <input
          v-model="patternInput"
          class="connector-list__filter"
          type="text"
          spellcheck="false"
          :placeholder="t('explorer.redisBrowser.patternPlaceholder')"
          :disabled="loading"
          @keydown.enter.prevent="onSearch"
      >
      <SearchInput
          v-model="localFilter"
          class="connector-list__filter"
          size="sm"
          :placeholder="t('explorer.redisBrowser.filterPlaceholder')"
          :disabled="loading || !keys.length"
      />
      <button
          class="connector-list__refresh"
          type="button"
          :disabled="loading || !connectionId"
          @click="scanKeys(true)"
      >
        {{ t('explorer.redisBrowser.search') }}
      </button>
    </div>

    <div
        v-if="dynamicPresets.length || prefixNav.length > 1"
        class="redis-keys-browser__chips"
    >
      <div v-if="dynamicPresets.length" class="redis-keys-browser__chip-row">
        <button
            class="redis-keys-browser__chip"
            type="button"
            :class="{ 'is-active': patternInput === '*' && !activePrefix }"
            :disabled="loading"
            @click="onPresetClick('*')"
        >
          {{ t('explorer.redisBrowser.presetAll') }}
        </button>
        <button
            v-for="pattern in dynamicPresets"
            :key="pattern"
            class="redis-keys-browser__chip"
            type="button"
            :class="{ 'is-active': patternInput === pattern }"
            :disabled="loading"
            @click="onPresetClick(pattern)"
        >
          {{ pattern }}
        </button>
      </div>
      <div v-if="prefixNav.length > 1" class="redis-keys-browser__chip-row">
        <button
            class="redis-keys-browser__chip"
            type="button"
            :class="{ 'is-active': !activePrefix }"
            @click="activePrefix = null"
        >
          {{ t('explorer.redisBrowser.allGroups') }}
        </button>
        <button
            v-for="group in visiblePrefixNav"
            :key="group.prefix"
            class="redis-keys-browser__chip"
            type="button"
            :class="{ 'is-active': activePrefix === group.prefix }"
            @click="onPrefixNavClick(group)"
        >
          {{ prefixLabel(group) }}
          <span>{{ group.keys.length }}</span>
        </button>
        <button
            v-if="prefixNav.length > REDIS_PREFIX_NAV_LIMIT"
            class="redis-keys-browser__chip"
            type="button"
            @click="prefixNavExpanded = !prefixNavExpanded"
        >
          {{ prefixNavExpanded
            ? t('explorer.redisBrowser.collapseGroups')
            : t('explorer.redisBrowser.moreGroups', {count: prefixNav.length - REDIS_PREFIX_NAV_LIMIT}) }}
        </button>
      </div>
    </div>

    <div class="connector-list__scroll" role="listbox">
      <table class="connector-browse-panel__table">
        <thead>
        <tr>
          <th>{{ t('explorer.redisBrowser.columns.key') }}</th>
        </tr>
        </thead>
        <tbody>
        <tr v-if="!loading && !filteredKeys.length">
          <td class="connector-list__empty">
            <EmptyState
                embedded
                compact
                :title="error || t('explorer.redisBrowser.empty')"
            />
          </td>
        </tr>
        <template v-for="group in prefixGroups" :key="group.prefix">
          <tr
              v-if="!activePrefix && prefixGroups.length > 1"
              class="redis-keys-browser__group-row"
              @click="toggleGroup(group.prefix)"
          >
            <td>
              <strong>{{ prefixLabel(group) }}</strong>
              <span class="redis-keys-browser__count">{{ group.keys.length }}</span>
              <span>{{ isGroupCollapsed(group.prefix) ? '▸' : '▾' }}</span>
            </td>
          </tr>
          <template v-if="activePrefix || !isGroupCollapsed(group.prefix)">
            <tr
                v-for="key in visibleKeysForGroup(group)"
                :key="key"
                class="is-clickable"
                :class="{ 'is-selected': selectedKey === key }"
                @click="onKeyClick(key)"
                @dblclick="onKeyDblClick(key)"
            >
              <td>
                <span class="redis-keys-browser__key" :title="key">{{ key }}</span>
              </td>
            </tr>
            <tr v-if="groupHasMoreKeys(group)">
              <td>
                <button type="button" class="dw-text-btn" @click="expandGroupKeys(group.prefix)">
                  {{ t('explorer.redisBrowser.showMoreKeys', {count: group.keys.length - REDIS_KEYS_VIRTUAL_PAGE}) }}
                </button>
              </td>
            </tr>
          </template>
        </template>
        </tbody>
      </table>
    </div>

    <div class="connector-list__foot connector-list__foot--head">
      <span>{{ statusText }}</span>
      <button
          v-if="hasMore"
          class="connector-list__refresh"
          type="button"
          :disabled="loading || loadingMore"
          @click="scanKeys(false)"
      >
        {{ loadingMore ? t('explorer.redisBrowser.loadingMore') : t('explorer.redisBrowser.loadMore') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.redis-keys-browser {
  height: 100%;
}

.redis-keys-browser__chips {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex-shrink: 0;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--dw-border);
}

.redis-keys-browser__chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.redis-keys-browser__chip {
  height: 1.5rem;
  padding: 0 0.5rem;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.redis-keys-browser__chip.is-active {
  color: var(--dw-text);
  background: var(--dw-bg-muted);
  font-weight: 600;
}

.redis-keys-browser__group-row {
  cursor: pointer;
  background: var(--dw-bg-muted);
}

.redis-keys-browser__group-row td {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.redis-keys-browser__count {
  color: var(--dw-text-muted);
  font-weight: 400;
}

.redis-keys-browser__key {
  font-family: var(--dw-mono);
  word-break: break-all;
}
</style>

