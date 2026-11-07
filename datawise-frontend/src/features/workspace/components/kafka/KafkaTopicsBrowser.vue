<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {ConfirmDialog, DwButton, DwInput, EmptyState, SearchInput} from '@/core/components'
import {explorerApi} from '@/api'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {
    deriveTopicPrefixPatterns,
    filterKafkaTopics,
    groupKafkaTopicsByPrefix,
    KAFKA_TOPICS_PAGE_SIZE,
    normalizeKafkaTopicPattern,
    type KafkaTopicPrefixGroup,
} from '@/features/explorer/services/kafka-topic-prefix.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
  connectionId: string
  selectedTopic?: string | null
  /** 嵌入圆角卡片内时去掉外层底色与硬边框 */
  embedded?: boolean
}>()

const emit = defineEmits<{
  select: [topic: string]
  stats: [payload: { total: number; loaded: number }]
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const {
  open: deleteConfirmOpen,
  title: deleteConfirmTitle,
  message: deleteConfirmMessage,
  confirmLabel: deleteConfirmLabel,
  confirmVariant: deleteConfirmVariant,
  confirmLoading: deleteConfirmLoading,
  ask: askDeleteConfirm,
  onConfirm: onDeleteConfirm,
  onOpenUpdate: onDeleteOpenUpdate,
} = useConfirmDialog('danger')

const KAFKA_PREFIX_NAV_LIMIT = 6

const patternInput = ref('')
const localFilter = ref('')
const topics = ref<string[]>([])
const totalCount = ref(0)
const fetchLimit = ref(KAFKA_TOPICS_PAGE_SIZE)
const loading = ref(false)
const loadingMore = ref(false)
const creating = ref(false)
const error = ref<string | null>(null)
const activePrefix = ref<string | null>(null)
const collapsedPrefixes = ref<Set<string>>(new Set())
const prefixNavExpanded = ref(false)
const showCreate = ref(false)
const createName = ref('')
const createPartitions = ref('1')
const createReplication = ref('1')

const filteredTopics = computed(() => filterKafkaTopics(topics.value, localFilter.value))

const prefixGroups = computed((): KafkaTopicPrefixGroup[] => {
  const groups = groupKafkaTopicsByPrefix(filteredTopics.value)
  if (!activePrefix.value) return groups
  return groups.filter((group) => group.prefix === activePrefix.value)
})

const dynamicPresets = computed(() => deriveTopicPrefixPatterns(topics.value, 6))

/** Already sorted by count desc in groupKafkaTopicsByPrefix */
const prefixNav = computed(() => groupKafkaTopicsByPrefix(topics.value))

const visiblePrefixNav = computed(() => {
  const groups = prefixNav.value
  if (prefixNavExpanded.value || groups.length <= KAFKA_PREFIX_NAV_LIMIT) return groups
  const top = groups.slice(0, KAFKA_PREFIX_NAV_LIMIT)
  if (activePrefix.value && !top.some((group) => group.prefix === activePrefix.value)) {
    const active = groups.find((group) => group.prefix === activePrefix.value)
    if (active) return [...top.slice(0, KAFKA_PREFIX_NAV_LIMIT - 1), active]
  }
  return top
})

const hasMore = computed(() => totalCount.value > topics.value.length)

const statusText = computed(() => {
  if (loading.value) return t('explorer.kafkaBrowser.loading')
  if (error.value) return error.value
  const loaded = topics.value.length
  const shown = filteredTopics.value.length
  const total = totalCount.value
  if (localFilter.value.trim()) {
    return t('explorer.kafkaBrowser.statusFiltered', {shown, loaded})
  }
  if (total > loaded) {
    return t('explorer.kafkaBrowser.statusWithTotal', {loaded, total})
  }
  return t('explorer.kafkaBrowser.status', {count: loaded})
})

async function loadTopics(reset: boolean) {
  if (!props.connectionId || loading.value || loadingMore.value) return
  if (reset) {
    loading.value = true
    fetchLimit.value = KAFKA_TOPICS_PAGE_SIZE
    error.value = null
    activePrefix.value = null
    collapsedPrefixes.value = new Set()
    prefixNavExpanded.value = false
  } else {
    loadingMore.value = true
    fetchLimit.value = Math.min(
        totalCount.value || fetchLimit.value + KAFKA_TOPICS_PAGE_SIZE,
        fetchLimit.value + KAFKA_TOPICS_PAGE_SIZE,
    )
  }

  try {
    const result = await explorerApi.fetchKafkaTopics(props.connectionId, {
      pattern: normalizeKafkaTopicPattern(patternInput.value) === '*'
          ? undefined
          : normalizeKafkaTopicPattern(patternInput.value),
      limit: fetchLimit.value,
    })
    topics.value = result.topics
    totalCount.value = result.totalCount
    emit('stats', {total: result.totalCount, loaded: result.topics.length})
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaBrowser.loadFailed')
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function onSearch() {
  void loadTopics(true)
}

function onPresetClick(pattern: string) {
  if (pattern === '*') {
    patternInput.value = ''
  } else {
    patternInput.value = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern
  }
  activePrefix.value = null
  void loadTopics(true)
}

function onPrefixNavClick(group: KafkaTopicPrefixGroup) {
  if (activePrefix.value === group.prefix) {
    activePrefix.value = null
    return
  }
  activePrefix.value = group.prefix
}

function toggleGroup(prefix: string) {
  const next = new Set(collapsedPrefixes.value)
  if (next.has(prefix)) next.delete(prefix)
  else next.add(prefix)
  collapsedPrefixes.value = next
}

function isGroupCollapsed(prefix: string) {
  return collapsedPrefixes.value.has(prefix)
}

function prefixLabel(group: KafkaTopicPrefixGroup) {
  return group.prefix === '__no_prefix__' ? t('explorer.kafkaBrowser.noPrefix') : group.label
}

function onTopicClick(topic: string) {
  emit('select', topic)
}

async function copyTopicName(topic: string, event: Event) {
  event.stopPropagation()
  try {
    await navigator.clipboard.writeText(topic)
  } catch {
    // ignore clipboard failures
  }
}

async function createTopic() {
  const name = createName.value.trim()
  if (!props.connectionId || !name) return
  const partitions = Number(createPartitions.value)
  const replicationFactor = Number(createReplication.value)
  creating.value = true
  error.value = null
  try {
    const result = await explorerApi.createKafkaTopic(props.connectionId, {
      name,
      partitions: Number.isFinite(partitions) ? partitions : 1,
      replicationFactor: Number.isFinite(replicationFactor) ? replicationFactor : 1,
    })
    layout.showSuccessToast(result.message || t('explorer.kafkaTopicAdmin.created'))
    showCreate.value = false
    createName.value = ''
    await loadTopics(true)
    emit('select', name)
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaTopicAdmin.createFailed')
  } finally {
    creating.value = false
  }
}

async function deleteSelectedTopic() {
  const topic = props.selectedTopic?.trim()
  if (!props.connectionId || !topic) return
  const confirmed = await askDeleteConfirm({
    title: t('explorer.kafkaTopicAdmin.deleteTitle'),
    message: t('explorer.kafkaTopicAdmin.deleteConfirm', {topic}),
    confirmLabel: t('explorer.kafkaTopicAdmin.delete'),
  })
  if (!confirmed) return
  deleteConfirmLoading.value = true
  error.value = null
  try {
    const result = await explorerApi.deleteKafkaTopic(props.connectionId, topic)
    layout.showSuccessToast(result.message || t('explorer.kafkaTopicAdmin.deleted'))
    await loadTopics(true)
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaTopicAdmin.deleteFailed')
  } finally {
    deleteConfirmLoading.value = false
  }
}

watch(() => props.connectionId, () => {
  patternInput.value = ''
  localFilter.value = ''
  topics.value = []
  totalCount.value = 0
  showCreate.value = false
  void loadTopics(true)
})

onMounted(() => {
  void loadTopics(true)
})

defineExpose({refresh: () => loadTopics(true)})
</script>

<template>
  <aside class="kafka-topics-browser" :class="{ 'is-embedded': embedded }">
    <div class="kafka-topics-browser__toolbar">
      <form class="kafka-topics-browser__search" @submit.prevent="onSearch">
        <input
            v-model="patternInput"
            class="dw-side-browser__field kafka-topics-browser__pattern"
            type="text"
            spellcheck="false"
            :placeholder="t('explorer.kafkaBrowser.patternPlaceholder')"
            :disabled="loading"
        >
        <DwButton
            variant="primary"
            size="sm"
            class="dw-side-browser__action"
            type="submit"
            :disabled="loading || !connectionId"
            :title="t('explorer.kafkaBrowser.searchHint')"
        >
          {{ t('explorer.kafkaBrowser.search') }}
        </DwButton>
        <button
            class="dw-icon-btn dw-icon-btn--sm"
            type="button"
            :title="t('explorer.kafkaBrowser.refresh')"
            :disabled="loading || !connectionId"
            @click="loadTopics(true)"
        >
          ↻
        </button>
        <DwButton
            variant="secondary"
            size="sm"
            type="button"
            :disabled="loading || !connectionId"
            @click="showCreate = !showCreate"
        >
          {{ t('explorer.kafkaTopicAdmin.create') }}
        </DwButton>
        <DwButton
            variant="secondary"
            size="sm"
            type="button"
            :disabled="loading || !selectedTopic"
            @click="deleteSelectedTopic"
        >
          {{ t('explorer.kafkaTopicAdmin.delete') }}
        </DwButton>
      </form>
      <div v-if="showCreate" class="kafka-topics-browser__create">
        <DwInput
            v-model="createName"
            variant="sm"
            type="text"
            :placeholder="t('explorer.kafkaTopicAdmin.namePlaceholder')"
        />
        <DwInput
            v-model="createPartitions"
            variant="sm"
            type="number"
            min="1"
            :title="t('explorer.kafkaTopicAdmin.partitions')"
        />
        <DwInput
            v-model="createReplication"
            variant="sm"
            type="number"
            min="1"
            :title="t('explorer.kafkaTopicAdmin.replication')"
        />
        <DwButton
            variant="primary"
            size="sm"
            :loading="creating"
            :disabled="creating || !createName.trim()"
            @click="createTopic"
        >
          {{ t('explorer.kafkaTopicAdmin.submitCreate') }}
        </DwButton>
      </div>
      <div class="kafka-topics-browser__filter-row">
        <SearchInput
            v-model="localFilter"
            class="kafka-topics-browser__filter"
            size="sm"
            :placeholder="t('explorer.kafkaBrowser.filterPlaceholder')"
            :disabled="loading || !topics.length"
        />
        <p class="kafka-topics-browser__status">{{ statusText }}</p>
      </div>
    </div>

    <div
        v-if="dynamicPresets.length || prefixNav.length > 1"
        class="dw-side-browser__filters"
    >
      <div v-if="dynamicPresets.length" class="dw-side-browser__rail">
        <span class="dw-side-browser__rail-label">{{ t('explorer.kafkaBrowser.presetsLabel') }}</span>
        <div class="dw-side-browser__chips">
          <button
              class="dw-side-browser__chip"
              type="button"
              :class="{ 'is-active': !patternInput && !activePrefix }"
              :disabled="loading"
              @click="onPresetClick('*')"
          >
            {{ t('explorer.kafkaBrowser.presetAll') }}
          </button>
          <button
              v-for="pattern in dynamicPresets"
              :key="pattern"
              class="dw-side-browser__chip"
              type="button"
              :class="{ 'is-active': patternInput && normalizeKafkaTopicPattern(patternInput) === pattern }"
              :disabled="loading"
              @click="onPresetClick(pattern)"
          >
            {{ pattern }}
          </button>
        </div>
      </div>

      <div v-if="prefixNav.length > 1" class="dw-side-browser__rail">
        <span class="dw-side-browser__rail-label">{{ t('explorer.kafkaBrowser.groupsLabel') }}</span>
        <div class="dw-side-browser__chips">
          <button
              class="dw-side-browser__chip"
              type="button"
              :class="{ 'is-active': !activePrefix }"
              @click="activePrefix = null"
          >
            {{ t('explorer.kafkaBrowser.allGroups') }}
          </button>
          <button
              v-for="group in visiblePrefixNav"
              :key="group.prefix"
              class="dw-side-browser__chip"
              type="button"
              :class="{ 'is-active': activePrefix === group.prefix }"
              @click="onPrefixNavClick(group)"
          >
            {{ prefixLabel(group) }}
            <span class="dw-side-browser__chip-count">{{ group.topics.length }}</span>
          </button>
          <button
              v-if="prefixNav.length > KAFKA_PREFIX_NAV_LIMIT"
              class="dw-side-browser__chip dw-side-browser__chip--more"
              type="button"
              @click="prefixNavExpanded = !prefixNavExpanded"
          >
            {{ prefixNavExpanded
              ? t('explorer.kafkaBrowser.collapseGroups')
              : t('explorer.kafkaBrowser.moreGroups', {count: prefixNav.length - KAFKA_PREFIX_NAV_LIMIT}) }}
          </button>
        </div>
      </div>
    </div>

    <div class="kafka-topics-browser__list" role="listbox">
      <EmptyState
          v-if="!loading && !filteredTopics.length && !error"
          embedded
          bordered
          :title="t('explorer.kafkaBrowser.empty')"
      />

      <section
          v-for="group in prefixGroups"
          :key="group.prefix"
          class="kafka-topics-browser__group"
      >
        <button
            v-if="!activePrefix && prefixGroups.length > 1"
            class="kafka-topics-browser__group-head"
            type="button"
            @click="toggleGroup(group.prefix)"
        >
          <span>{{ prefixLabel(group) }}</span>
          <span class="kafka-topics-browser__group-meta">
            {{ group.topics.length }}
            <span class="kafka-topics-browser__twistie">{{ isGroupCollapsed(group.prefix) ? '▸' : '▾' }}</span>
          </span>
        </button>

        <ul v-show="activePrefix || !isGroupCollapsed(group.prefix)" class="kafka-topics-browser__items">
          <li
              v-for="topic in group.topics"
              :key="topic"
              class="kafka-topics-browser__item"
              :class="{ 'is-selected': selectedTopic === topic }"
              role="option"
              :aria-selected="selectedTopic === topic"
              @click="onTopicClick(topic)"
          >
            <span class="kafka-topics-browser__topic" :title="topic">{{ topic }}</span>
            <button
                class="kafka-topics-browser__copy"
                type="button"
                :title="t('explorer.kafkaBrowser.copyTopic')"
                @click="copyTopicName(topic, $event)"
            >
              ⧉
            </button>
          </li>
        </ul>
      </section>
    </div>

    <footer v-if="hasMore" class="kafka-topics-browser__footer">
      <button
          class="kafka-topics-browser__more"
          type="button"
          :disabled="loading || loadingMore"
          @click="loadTopics(false)"
      >
        {{ loadingMore ? t('explorer.kafkaBrowser.loadingMore') : t('explorer.kafkaBrowser.loadMore') }}
      </button>
    </footer>
  </aside>

  <ConfirmDialog
      :open="deleteConfirmOpen"
      :title="deleteConfirmTitle"
      :message="deleteConfirmMessage"
      :confirm-label="deleteConfirmLabel"
      :confirm-loading="deleteConfirmLoading"
      :confirm-variant="deleteConfirmVariant"
      @update:open="onDeleteOpenUpdate"
      @confirm="onDeleteConfirm"
  />
</template>

<style scoped>
.kafka-topics-browser {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--dw-bg-panel);
}

.kafka-topics-browser.is-embedded {
  background: transparent;
}

.kafka-topics-browser.is-embedded .kafka-topics-browser__toolbar {
  padding-left: var(--dw-space-7);
  padding-right: var(--dw-space-7);
}

.kafka-topics-browser.is-embedded .kafka-topics-browser__list {
  padding: var(--dw-space-2) var(--dw-space-7) var(--dw-space-4);
}

.kafka-topics-browser.is-embedded .kafka-topics-browser__footer {
  padding: var(--dw-space-4) var(--dw-space-7) var(--dw-space-7);
}

.kafka-topics-browser__toolbar {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-5) var(--dw-space-7) var(--dw-space-4);
}

.kafka-topics-browser__create {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 72px 72px auto;
  gap: var(--dw-gap-sm);
  align-items: center;
}

.kafka-topics-browser__search,
.kafka-topics-browser__filter-row {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.kafka-topics-browser__status {
  margin: 0;
  flex-shrink: 0;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.kafka-topics-browser__list {
  flex: 1;
  overflow: auto;
  padding: var(--dw-space-3) var(--dw-space-6) var(--dw-space-5);
}

.kafka-topics-browser__group + .kafka-topics-browser__group {
  margin-top: var(--dw-space-2);
}

.kafka-topics-browser__group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--dw-space-2) var(--dw-space-3);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, transparent);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  cursor: pointer;
}

.kafka-topics-browser__group-meta {
  display: inline-flex;
  gap: var(--dw-gap-sm);
  align-items: center;
  color: var(--dw-text-muted);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.kafka-topics-browser__items {
  margin: var(--dw-space-1) 0 0;
  padding: 0;
  list-style: none;
}

.kafka-topics-browser__item {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-2) var(--dw-space-3);
  border-radius: var(--dw-control-radius-sm);
  cursor: pointer;
}

.kafka-topics-browser__item:hover,
.kafka-topics-browser__item.is-selected {
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.kafka-topics-browser.is-embedded .kafka-topics-browser__item.is-selected {
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
}

.kafka-topics-browser__topic {
  flex: 1;
  min-width: 0;
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  word-break: break-all;
}

.kafka-topics-browser__copy {
  flex-shrink: 0;
  padding: 0 var(--dw-space-2);
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  opacity: 0;
  cursor: pointer;
}

.kafka-topics-browser__item:hover .kafka-topics-browser__copy,
.kafka-topics-browser__item.is-selected .kafka-topics-browser__copy {
  opacity: 1;
}

.kafka-topics-browser__footer {
  padding: var(--dw-space-4) var(--dw-space-6) var(--dw-space-5);
  border-top: 1px solid color-mix(in srgb, var(--dw-border) 55%, transparent);
}

.kafka-topics-browser__more {
  width: 100%;
  height: var(--dw-control-h-sm);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  cursor: pointer;
}

.kafka-topics-browser__more:hover:not(:disabled) {
  color: var(--dw-text);
  background: var(--dw-bg-hover);
}

.kafka-topics-browser__more:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
