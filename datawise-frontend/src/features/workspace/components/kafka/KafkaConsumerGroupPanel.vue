<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {ConfirmDialog, DwButton, DwInlineAlert, DwInput, DwSelect, EmptyState} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {explorerApi} from '@/api'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {useLayoutStore} from '@/features/layout/stores/layout'
import type {
  KafkaConsumerGroupMetrics,
  KafkaConsumerGroupSummary,
} from '@/features/explorer/services/kafka-topic.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = withDefaults(defineProps<{
  connectionId: string
  topic?: string
  showTopicFilter?: boolean
  /** topic = 当前 Topic 的订阅；cluster = 整个消费组在所有 Topic 上的位点 */
  mode?: 'cluster' | 'topic'
}>(), {
  mode: 'cluster',
})

const {t} = useI18n()
const layout = useLayoutStore()
const {
  open: resetConfirmOpen,
  title: resetConfirmTitle,
  message: resetConfirmMessage,
  confirmLabel: resetConfirmLabel,
  confirmVariant: resetConfirmVariant,
  confirmLoading: resetConfirmLoading,
  ask: askResetConfirm,
  onConfirm: onResetConfirm,
  onOpenUpdate: onResetOpenUpdate,
} = useConfirmDialog('danger')

const groupInput = ref('')
const groupFilter = ref('')
const topicInput = ref(props.topic ?? '')
const groups = ref<KafkaConsumerGroupSummary[]>([])
const metrics = ref<KafkaConsumerGroupMetrics | null>(null)
const loadingGroups = ref(false)
const loadingMetrics = ref(false)
const resetting = ref(false)
const error = ref<string | null>(null)
const resetTopic = ref('')
const filteredGroups = computed(() => {
  const keyword = groupFilter.value.trim().toLowerCase()
  if (!keyword) return groups.value
  return groups.value.filter((group) => group.groupId.toLowerCase().includes(keyword))
})

const effectiveTopic = computed(() => {
  if (props.mode === 'topic') return (props.topic ?? '').trim()
  return (props.showTopicFilter ? topicInput.value : props.topic ?? '').trim()
})

const resetTopicOptions = computed<SelectOption[]>(() => {
  const names = new Set<string>()
  for (const row of metrics.value?.partitions ?? []) {
    if (row.topic) names.add(row.topic)
  }
  return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({value: name, label: name}))
})

const resetTarget = computed(() => {
  if (props.mode === 'topic' || props.showTopicFilter || (props.topic ?? '').trim()) {
    return effectiveTopic.value
  }
  return resetTopic.value.trim()
})

const emptyHintTopic = computed(() => effectiveTopic.value || t('explorer.kafkaConsumerGroup.anyTopic'))

const stateClass = computed(() => {
  const state = metrics.value?.state?.toLowerCase() ?? ''
  if (state === 'stable') return 'is-stable'
  if (state === 'empty' || state === 'dead') return 'is-muted'
  return 'is-warn'
})

function formatOffset(value: number) {
  return value < 0 ? '—' : String(value)
}

async function loadGroups() {
  if (!props.connectionId) return
  loadingGroups.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchKafkaConsumerGroups(props.connectionId, {limit: 300})
    groups.value = result.groups
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaConsumerGroup.loadGroupsFailed')
    groups.value = []
  } finally {
    loadingGroups.value = false
  }
}

async function loadMetrics() {
  const groupId = groupInput.value.trim()
  if (!props.connectionId || !groupId) {
    metrics.value = null
    return
  }
  loadingMetrics.value = true
  error.value = null
  try {
    metrics.value = await explorerApi.fetchKafkaConsumerGroupMetrics(
        props.connectionId,
        groupId,
        {topic: effectiveTopic.value || undefined},
    )
  } catch (err) {
    metrics.value = null
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaConsumerGroup.loadMetricsFailed')
  } finally {
    loadingMetrics.value = false
  }
}

function selectGroup(groupId: string) {
  groupInput.value = groupId
  void loadMetrics()
}

async function resetOffsets(strategy: 'earliest' | 'latest') {
  const groupId = groupInput.value.trim()
  const topic = resetTarget.value
  if (!props.connectionId || !groupId || !topic) {
    error.value = t('explorer.kafkaConsumerGroup.resetNeedTopic')
    return
  }
  const confirmed = await askResetConfirm({
    title: t('explorer.kafkaConsumerGroup.resetTitle'),
    message: t('explorer.kafkaConsumerGroup.resetConfirm', {group: groupId, topic, strategy}),
    confirmLabel: t('explorer.kafkaConsumerGroup.resetAction'),
  })
  if (!confirmed) return
  resetting.value = true
  resetConfirmLoading.value = true
  error.value = null
  try {
    await explorerApi.resetKafkaConsumerGroupOffsets(props.connectionId, groupId, {
      topic,
      strategy,
    })
    await loadMetrics()
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaConsumerGroup.resetFailed')
  } finally {
    resetting.value = false
    resetConfirmLoading.value = false
  }
}

watch(
    () => [props.connectionId, props.topic] as const,
    ([, topic]) => {
      groupInput.value = ''
      metrics.value = null
      error.value = null
      if (topic !== undefined) topicInput.value = topic
      void loadGroups()
    },
)

watch(resetTopicOptions, (options) => {
  if (!options.length) {
    resetTopic.value = ''
    return
  }
  if (!options.some((option) => option.value === resetTopic.value)) {
    resetTopic.value = String(options[0]?.value ?? '')
  }
})

watch(
    () => groupInput.value,
    (value, previous) => {
      if (value.trim() === previous.trim()) return
      if (!value.trim()) {
        metrics.value = null
        return
      }
    },
)

onMounted(() => {
  void loadGroups()
})

defineExpose({
  refresh: () => {
    void loadGroups()
    void loadMetrics()
  },
})
</script>

<template>
  <div class="kafka-consumer-group-panel">
    <p v-if="mode === 'topic' && topic" class="kafka-consumer-group-panel__scope">
      {{ t('explorer.kafkaConsumerGroup.topicScopeHint', {topic}) }}
    </p>
    <p v-else-if="mode === 'cluster' && !showTopicFilter" class="kafka-consumer-group-panel__scope">
      {{ t('explorer.kafkaConsumerGroup.clusterHint') }}
    </p>

    <div class="kafka-consumer-group-panel__toolbar">
      <label
          v-if="showTopicFilter && mode !== 'topic'"
          class="kafka-consumer-group-panel__field"
      >
        <span>{{ t('explorer.kafkaConsumerGroup.topic') }}</span>
        <DwInput
            v-model="topicInput"
            variant="sm"
            type="text"
            :spellcheck="false"
            :placeholder="t('explorer.kafkaConsumerGroup.topicPlaceholder')"
        />
      </label>

      <label class="kafka-consumer-group-panel__field">
        <span>{{ t('explorer.kafkaConsumerGroup.group') }}</span>
        <DwInput
            v-model="groupInput"
            variant="sm"
            type="text"
            :spellcheck="false"
            list="kafka-consumer-group-options"
            :placeholder="t('explorer.kafkaConsumerGroup.groupPlaceholder')"
            @keydown.enter.prevent="loadMetrics"
        />
      </label>

      <label class="kafka-consumer-group-panel__field kafka-consumer-group-panel__field--filter">
        <span>{{ t('explorer.kafkaConsumerGroup.filter') }}</span>
        <DwInput
            v-model="groupFilter"
            variant="sm"
            type="search"
            :spellcheck="false"
            :placeholder="t('explorer.kafkaConsumerGroup.filterPlaceholder')"
        />
      </label>

      <DwButton
          variant="secondary"
          size="sm"
          :loading="loadingMetrics"
          :disabled="!groupInput.trim() || loadingMetrics"
          @click="loadMetrics"
      >
        {{ loadingMetrics ? t('explorer.kafkaConsumerGroup.loading') : t('explorer.kafkaConsumerGroup.viewMetrics') }}
      </DwButton>

      <DwButton
          variant="secondary"
          size="sm"
          :loading="loadingGroups"
          @click="loadGroups"
      >
        {{ t('explorer.kafkaConsumerGroup.reloadGroups') }}
      </DwButton>

      <label
          v-if="mode === 'cluster' && !showTopicFilter && resetTopicOptions.length"
          class="kafka-consumer-group-panel__field"
      >
        <span>{{ t('explorer.kafkaConsumerGroup.resetTopic') }}</span>
        <DwSelect v-model="resetTopic" size="sm" :options="resetTopicOptions"/>
      </label>

      <DwButton
          variant="secondary"
          size="sm"
          :loading="resetting"
          :disabled="!groupInput.trim() || !resetTarget || resetting"
          @click="resetOffsets('latest')"
      >
        {{ t('explorer.kafkaConsumerGroup.resetLatest') }}
      </DwButton>

      <DwButton
          variant="secondary"
          size="sm"
          :loading="resetting"
          :disabled="!groupInput.trim() || !resetTarget || resetting"
          @click="resetOffsets('earliest')"
      >
        {{ t('explorer.kafkaConsumerGroup.resetEarliest') }}
      </DwButton>
    </div>

    <datalist id="kafka-consumer-group-options">
      <option v-for="group in filteredGroups" :key="group.groupId" :value="group.groupId" />
    </datalist>

    <div v-if="filteredGroups.length" class="kafka-consumer-group-panel__chips">
      <button
          v-for="group in filteredGroups.slice(0, 8)"
          :key="group.groupId"
          type="button"
          class="kafka-consumer-group-panel__chip"
          :class="{ 'is-active': groupInput === group.groupId }"
          @click="selectGroup(group.groupId)"
      >
        {{ group.groupId }}
        <span class="kafka-consumer-group-panel__chip-state">{{ group.state }}</span>
      </button>
    </div>

    <DwInlineAlert v-if="error" :message="error"/>

    <EmptyState
        v-else-if="!metrics && !loadingMetrics"
        embedded
        bordered
        :title="t('explorer.kafkaConsumerGroup.emptyTitle')"
        :description="t('explorer.kafkaConsumerGroup.emptyHint', {topic: emptyHintTopic})"
    />

    <div v-else-if="metrics" class="kafka-consumer-group-panel__summary">
      <span class="kafka-consumer-group-panel__badge" :class="stateClass">{{ metrics.state }}</span>
      <span class="kafka-consumer-group-panel__meta">
        {{ t('explorer.kafkaConsumerGroup.members', {count: metrics.memberCount}) }}
      </span>
      <span class="kafka-consumer-group-panel__meta">
        {{ t('explorer.kafkaConsumerGroup.totalLag', {count: metrics.totalLag}) }}
      </span>
    </div>

    <div v-if="metrics?.partitions.length" class="kafka-consumer-group-panel__table-wrap">
      <table class="kafka-consumer-group-panel__table">
        <thead>
          <tr>
            <th>{{ t('explorer.kafkaConsumerGroup.colPartition') }}</th>
            <th>{{ t('explorer.kafkaConsumerGroup.colCommitted') }}</th>
            <th>{{ t('explorer.kafkaConsumerGroup.colEnd') }}</th>
            <th>{{ t('explorer.kafkaConsumerGroup.colLag') }}</th>
            <th>{{ t('explorer.kafkaConsumerGroup.colMember') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
              v-for="row in metrics.partitions"
              :key="`${row.topic}-${row.partition}`"
              :class="{ 'is-hot': row.lag > 0 }"
          >
            <td>#{{ row.partition }}</td>
            <td>{{ formatOffset(row.committedOffset) }}</td>
            <td>{{ formatOffset(row.endOffset) }}</td>
            <td>{{ row.lag }}</td>
            <td class="kafka-consumer-group-panel__member">{{ row.memberId || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <EmptyState
        v-else-if="metrics && !metrics.partitions.length"
        embedded
        bordered
        :title="t('explorer.kafkaConsumerGroup.noPartitionsTitle')"
        :description="t('explorer.kafkaConsumerGroup.noPartitionsHint', {topic: emptyHintTopic})"
    />
  </div>

  <ConfirmDialog
      :open="resetConfirmOpen"
      :title="resetConfirmTitle"
      :message="resetConfirmMessage"
      :confirm-label="resetConfirmLabel"
      :confirm-loading="resetConfirmLoading"
      :confirm-variant="resetConfirmVariant"
      @update:open="onResetOpenUpdate"
      @confirm="onResetConfirm"
  />
</template>

<style scoped>
.kafka-consumer-group-panel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  padding: var(--dw-space-5) var(--dw-space-6) var(--dw-space-6);
}

.kafka-consumer-group-panel__scope {
  margin: 0;
  flex-shrink: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.kafka-consumer-group-panel__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--dw-gap-md);
  flex-shrink: 0;
}

.kafka-consumer-group-panel__field {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-xs);
  min-width: 0;
  flex: 1 1 180px;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.kafka-consumer-group-panel__field--filter {
  flex: 0 1 160px;
}

.kafka-consumer-group-panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap);
  flex-shrink: 0;
}

.kafka-consumer-group-panel__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  max-width: 100%;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-radius-pill);
  padding: var(--dw-space-2) var(--dw-space-5);
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-tight);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kafka-consumer-group-panel__chip.is-active {
  border-color: var(--dw-primary);
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.kafka-consumer-group-panel__chip-state {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.kafka-consumer-group-panel__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
  flex-shrink: 0;
}

.kafka-consumer-group-panel__badge {
  padding: 1px var(--dw-space-4);
  border-radius: var(--dw-radius-pill);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.kafka-consumer-group-panel__badge.is-stable {
  background: color-mix(in srgb, var(--dw-success) 12%, transparent);
  color: var(--dw-success);
}

.kafka-consumer-group-panel__badge.is-warn {
  background: color-mix(in srgb, var(--mp-tone-amber) 12%, transparent);
  color: var(--mp-tone-amber);
}

.kafka-consumer-group-panel__badge.is-muted {
  background: color-mix(in srgb, var(--dw-text-muted) 12%, transparent);
  color: var(--dw-text-muted);
}

.kafka-consumer-group-panel__meta {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.kafka-consumer-group-panel__table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-editor);
}

.kafka-consumer-group-panel__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-text-xs);
}

.kafka-consumer-group-panel__table th,
.kafka-consumer-group-panel__table td {
  padding: var(--dw-space-3) var(--dw-space-6);
  border-bottom: 1px solid var(--dw-border);
  text-align: left;
  white-space: nowrap;
}

.kafka-consumer-group-panel__table th {
  position: sticky;
  top: 0;
  background: var(--dw-bg-panel);
  color: var(--dw-text-muted);
  font-weight: 600;
}

.kafka-consumer-group-panel__table tr.is-hot td:nth-child(4) {
  color: var(--mp-tone-amber);
  font-weight: 600;
}

.kafka-consumer-group-panel__member {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--dw-font-mono);
}
</style>
