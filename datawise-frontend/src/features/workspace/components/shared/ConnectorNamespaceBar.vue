<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState, SearchInput} from '@/core/components'
import TabBarOverflow from '@/core/components/TabBarOverflow.vue'

export type ConnectorNamespaceOption = {
  value: string
  label: string
}

const model = defineModel<string>({required: true})

const props = withDefaults(
    defineProps<{
      options: ConnectorNamespaceOption[]
      label: string
      statusText?: string
      searchPlaceholder?: string
      loading?: boolean
      /** Show inline search when option count reaches this threshold. */
      searchThreshold?: number
    }>(),
    {
      statusText: '',
      searchPlaceholder: '',
      loading: false,
      searchThreshold: 10,
    },
)

const emit = defineEmits<{
  select: [value: string]
}>()

const {t} = useI18n()
const query = ref('')
const overflowOpen = ref(false)
const railRef = ref<HTMLElement | null>(null)
const visibleCount = ref(0)
let resizeObserver: ResizeObserver | null = null

const showSearch = computed(() => props.options.length >= props.searchThreshold)

/** Active namespace stays first so the current selection never hides behind「更多」. */
const displayOptions = computed(() => {
  const q = query.value.trim().toLowerCase()
  let list = props.options
  if (q) {
    list = list.filter(
        (item) =>
            item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q),
    )
  }
  const active = list.find((item) => item.value === model.value)
      ?? props.options.find((item) => item.value === model.value)
  const rest = list.filter((item) => item.value !== model.value)
  return active ? [active, ...rest] : list
})

const hasOverflow = computed(() => displayOptions.value.length > visibleCount.value)

const overflowItems = computed(() =>
    props.options.map((item) => ({
      id: item.value || '__empty__',
      label: item.label,
    })),
)

const filterHint = computed(() => {
  if (!showSearch.value || !query.value.trim()) return ''
  return t('explorer.connectorNamespace.filterHint', {
    shown: displayOptions.value.length,
    total: props.options.length,
  })
})

function optionKey(item: ConnectorNamespaceOption) {
  return item.value || '__empty__'
}

function measureVisibleCount() {
  const rail = railRef.value
  const options = displayOptions.value
  if (!rail || options.length === 0) {
    visibleCount.value = 0
    return
  }

  // Read widths from the hidden measure row (all tabs in normal flow).
  const measureRow = rail.querySelector<HTMLElement>('[data-ns-measure]')
  const measureTabs = measureRow
      ? Array.from(measureRow.querySelectorAll<HTMLElement>('[data-ns-measure-tab]'))
      : []
  const widths = options.map((_, index) => measureTabs[index]?.offsetWidth ?? 0)
  if (widths.some((width) => width <= 0)) {
    visibleCount.value = options.length
    nextTick(() => requestAnimationFrame(measureVisibleCount))
    return
  }

  const available = rail.clientWidth
  const total = widths.reduce((sum, width) => sum + width, 0)
  if (total <= available + 1) {
    visibleCount.value = options.length
    return
  }

  let used = 0
  let count = 0
  for (const width of widths) {
    if (used + width > available) break
    used += width
    count += 1
  }
  visibleCount.value = Math.max(count, widths[0] && widths[0] <= available ? 1 : 0)
}

function scheduleMeasure() {
  nextTick(() => requestAnimationFrame(measureVisibleCount))
}

function onSelect(value: string) {
  if (model.value === value) return
  model.value = value
  emit('select', value)
  scheduleMeasure()
}

function onOverflowSelect(id: string) {
  onSelect(id === '__empty__' ? '' : id)
}

watch(
    () => [props.options, model.value, query.value, showSearch.value] as const,
    () => {
      if (!showSearch.value) query.value = ''
      scheduleMeasure()
    },
    {deep: true},
)

onMounted(() => {
  visibleCount.value = displayOptions.value.length
  scheduleMeasure()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => measureVisibleCount())
    if (railRef.value) resizeObserver.observe(railRef.value)
  }
  window.addEventListener('resize', measureVisibleCount)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', measureVisibleCount)
})

watch(railRef, (el, _prev, onCleanup) => {
  if (!el || !resizeObserver) return
  resizeObserver.observe(el)
  onCleanup(() => resizeObserver?.unobserve(el))
})
</script>

<template>
  <header class="connector-ns-bar">
    <div class="connector-ns-bar__meta">
      <div class="connector-ns-bar__meta-start">
        <span class="connector-ns-bar__eyebrow">{{ label }}</span>
        <span v-if="filterHint" class="connector-ns-bar__hint">{{ filterHint }}</span>
      </div>
      <span v-if="statusText" class="connector-ns-bar__status">{{ statusText }}</span>
    </div>

    <div
        class="connector-ns-bar__row"
        :class="{ 'connector-ns-bar__row--crowded': options.length >= 6 || hasOverflow }"
    >
      <div v-if="showSearch" class="connector-ns-bar__search">
        <SearchInput
            v-model="query"
            size="sm"
            :placeholder="searchPlaceholder || t('explorer.connectorNamespace.search')"
            :aria-label="searchPlaceholder || t('explorer.connectorNamespace.search')"
        />
      </div>

      <div ref="railRef" class="connector-ns-bar__rail">
        <!-- Invisible full row for width measurement only -->
        <div class="connector-ns-bar__measure" data-ns-measure aria-hidden="true">
          <span
              v-for="item in displayOptions"
              :key="`m-${optionKey(item)}`"
              class="connector-ns-bar__tab"
              data-ns-measure-tab
          >{{ item.label }}</span>
        </div>

        <nav
            v-if="displayOptions.length"
            class="connector-ns-bar__tabs"
            :aria-label="label"
        >
          <button
              v-for="(item, index) in displayOptions"
              :key="optionKey(item)"
              type="button"
              class="connector-ns-bar__tab"
              :class="{
                'is-active': model === item.value,
                'is-clipped': index >= visibleCount,
              }"
              :tabindex="index >= visibleCount ? -1 : 0"
              :aria-hidden="index >= visibleCount ? 'true' : undefined"
              :disabled="loading"
              @click="onSelect(item.value)"
          >
            {{ item.label }}
          </button>
        </nav>
        <EmptyState
            v-else
            embedded
            compact
            class="connector-ns-bar__empty"
            :title="t('explorer.connectorNamespace.filterEmpty')"
        />
      </div>

      <div class="connector-ns-bar__more" :class="{ 'is-visible': hasOverflow }">
        <TabBarOverflow
            v-if="overflowItems.length"
            v-model:open="overflowOpen"
            :visible="hasOverflow"
            :items="overflowItems"
            :active-id="model || '__empty__'"
            :title="t('explorer.connectorNamespace.more')"
            :search-placeholder="searchPlaceholder || t('explorer.connectorNamespace.search')"
            @select="onOverflowSelect"
        />
      </div>
    </div>
  </header>
</template>

<style scoped>
.connector-ns-bar {
  display: flex;
  flex-direction: column;
  gap: var(--dw-wb-stack-gap);
  padding: var(--dw-wb-pane-pad);
  border: 1px solid var(--dw-wb-card-border);
  /* AURA-X: [Modify] - 内卡 inset 走 wb token，与 pane 对齐 */
  /* Protection: 功能完整性已验证，无简化行为 */
  /* 人格: [@前端艺术家] */
  border-radius: var(--dw-wb-card-radius, calc(var(--dw-panel-radius) + 2px));
  background:
      linear-gradient(
          180deg,
          color-mix(in srgb, var(--dw-bg-panel) 88%, var(--dw-primary) 12%),
          var(--dw-bg-panel)
      );
}

.connector-ns-bar__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--dw-space-3);
  flex-wrap: wrap;
}

.connector-ns-bar__meta-start {
  display: inline-flex;
  align-items: baseline;
  gap: var(--dw-wb-stack-gap);
  min-width: 0;
}

.connector-ns-bar__eyebrow {
  font-size: var(--dw-font-size-menu-caption);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
  font-weight: 600;
}

.connector-ns-bar__hint,
.connector-ns-bar__status {
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.connector-ns-bar__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dw-wb-stack-gap);
  min-width: 0;
  border-bottom: 1px solid var(--dw-border-light);
  padding-bottom: 2px;
}

.connector-ns-bar__row--crowded {
  padding-right: 36px; /* stable slot for「更多」 */
}

.connector-ns-bar__search {
  flex: 0 0 200px;
  max-width: 200px;
  min-width: 140px;
}

.connector-ns-bar__rail {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.connector-ns-bar__measure {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  flex-wrap: nowrap;
  visibility: hidden;
  pointer-events: none;
  z-index: -1;
}

.connector-ns-bar__tabs {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0;
}

.connector-ns-bar__tab {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  border-radius: 0;
  padding: 8px 12px;
  font-size: var(--dw-text-md);
  line-height: 1.35;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -3px;
  white-space: nowrap;
  flex: 0 0 auto;
}

.connector-ns-bar__tab.is-clipped {
  display: none;
}

.connector-ns-bar__tab:hover:not(:disabled) {
  color: var(--dw-text);
}

.connector-ns-bar__tab.is-active {
  color: var(--dw-primary);
  font-weight: 600;
  border-bottom-color: var(--dw-primary);
}

.connector-ns-bar__tab:disabled {
  opacity: 0.6;
  cursor: default;
}

.connector-ns-bar__empty {
  padding: 8px 0 4px;
}

.connector-ns-bar__more {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 2px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 36px;
  opacity: 0;
  pointer-events: none;
}

.connector-ns-bar__more.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.connector-ns-bar__more :deep(.dw-tab-overflow) {
  margin-left: 0;
  padding-left: 0;
  border-left: none;
}
</style>
