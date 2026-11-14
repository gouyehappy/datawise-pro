<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, DwInput, DwSelect, EmptyState} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {explorerApi} from '@/api'
import {useLayoutStore} from '@/features/layout/stores/layout'
import type {KafkaMessage, KafkaTopicConfigs, KafkaTopicDetail} from '@/features/explorer/services/kafka-topic.service'
import {
  filterKafkaMessages,
  isKafkaPartitionHealthy,
  kafkaPartitionMessageCount,
  sortKafkaMessagesByTimestamp,
} from '@/features/explorer/services/kafka-topic.service'
import {
  formatMessageTimestamp,
  isStructuredMessageValue,
  summarizeMessageValue,
  tryFormatMessageValue,
} from '@/features/explorer/services/kafka-message-format.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = withDefaults(defineProps<{
  connectionId: string
  topic: string
  section?: 'messages' | 'monitor' | 'policies'
}>(), {
  section: 'messages',
})

const emit = defineEmits<{
  useInProducer: [payload: { key: string; value: string; partition: number }]
}>()

const {t} = useI18n()
const layout = useLayoutStore()

const detail = ref<KafkaTopicDetail | null>(null)
const configs = ref<KafkaTopicConfigs | null>(null)
const messages = ref<KafkaMessage[]>([])
const loading = ref(false)
const messagesLoading = ref(false)
const configsSaving = ref(false)
const partitionsSaving = ref(false)
const error = ref<string | null>(null)
const partition = ref<number | null>(null)
const fromBeginning = ref(false)
const selectedIndex = ref<number | null>(null)
const messageFilter = ref('')
const messageOrder = ref<'newest' | 'oldest'>('newest')
const retentionMsInput = ref('')
const retentionBytesInput = ref('')
const newPartitionCount = ref('')

const offsetMode = computed({
  get: () => (fromBeginning.value ? 'earliest' : 'latest'),
  set: (value: string) => {
    fromBeginning.value = value === 'earliest'
  },
})

const offsetModeOptions = computed<SelectOption[]>(() => [
  {value: 'latest', label: t('explorer.kafkaMessages.fromLatest')},
  {value: 'earliest', label: t('explorer.kafkaMessages.fromBeginning')},
])

const messageOrderOptions = computed<SelectOption[]>(() => [
  {value: 'newest', label: t('explorer.kafkaMessages.orderNewest')},
  {value: 'oldest', label: t('explorer.kafkaMessages.orderOldest')},
])

const partitionOptions = computed(() => detail.value?.partitions ?? [])

const partitionSelect = computed({
  get: () => (partition.value == null ? '' : String(partition.value)),
  set: (v: string) => {
    partition.value = v === '' ? null : Number(v)
  },
})

const partitionSelectOptions = computed<SelectOption[]>(() => [
  {value: '', label: t('explorer.kafkaMessages.allPartitions')},
  ...partitionOptions.value.map((item) => ({
    value: String(item.partition),
    label: `#${item.partition}`,
  })),
])

const overview = computed(() => {
  const rows = detail.value?.partitions ?? []
  if (!rows.length) return null
  const totalMessages = rows.reduce((sum, row) => sum + kafkaPartitionMessageCount(row), 0)
  const healthy = rows.filter((row) => isKafkaPartitionHealthy(row)).length
  const offline = rows.filter((row) => row.leader < 0).length
  const underReplicated = rows.filter(
      (row) => row.replicas.length > 0 && row.isr.length < row.replicas.length,
  ).length
  return {
    partitionCount: rows.length,
    replicationFactor: detail.value?.replicationFactor ?? 0,
    totalMessages,
    healthy,
    offline,
    underReplicated,
  }
})

const displayedMessages = computed(() =>
    sortKafkaMessagesByTimestamp(filterKafkaMessages(messages.value, messageFilter.value), messageOrder.value),
)

const selectedMessage = computed(() => {
  if (selectedIndex.value == null) return null
  return displayedMessages.value[selectedIndex.value] ?? null
})

const selectedValue = computed(() =>
    selectedMessage.value ? tryFormatMessageValue(selectedMessage.value.value) : '',
)

const selectedValueIsJson = computed(() =>
    selectedMessage.value ? isStructuredMessageValue(selectedMessage.value.value) : false,
)

const offsetLabel = computed(() => {
  if (!selectedMessage.value) return '—'
  return `@${selectedMessage.value.offset}`
})

const partitionLabel = computed(() => {
  if (!selectedMessage.value) return '—'
  return `#${selectedMessage.value.partition}`
})

const timeLabel = computed(() => {
  if (!selectedMessage.value) return '—'
  return formatMessageTimestamp(selectedMessage.value.timestamp)
})

const isBusy = computed(() => loading.value || messagesLoading.value)

const sectionTitle = computed(() => {
  if (props.section === 'monitor') return t('explorer.kafkaConsole.tabs.monitor')
  if (props.section === 'policies') return t('explorer.kafkaPolicies.title')
  return t('explorer.kafkaMessages.title')
})

function syncRetentionInputs(next: KafkaTopicConfigs | null) {
  retentionMsInput.value = next?.retentionMs == null ? '' : String(next.retentionMs)
  retentionBytesInput.value = next?.retentionBytes == null ? '' : String(next.retentionBytes)
}

async function loadMessages() {
  if (!props.connectionId || !props.topic) return
  messagesLoading.value = true
  error.value = null
  try {
    const result = await explorerApi.fetchKafkaMessages(props.connectionId, props.topic, {
      partition: partition.value ?? undefined,
      limit: 50,
      fromBeginning: fromBeginning.value,
    })
    messages.value = result.messages
    selectedIndex.value = result.messages.length ? 0 : null
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaMessages.loadFailed')
    messages.value = []
    selectedIndex.value = null
  } finally {
    messagesLoading.value = false
  }
}

async function loadData() {
  if (!props.connectionId || !props.topic) return
  loading.value = true
  error.value = null
  try {
    if (props.section === 'policies') {
      const configsResult = await explorerApi.fetchKafkaTopicConfigs(props.connectionId, props.topic)
      configs.value = configsResult
      syncRetentionInputs(configsResult)
      return
    }
    const detailResult = await explorerApi.fetchKafkaTopicDetail(props.connectionId, props.topic)
    detail.value = detailResult
    newPartitionCount.value = String((detailResult.partitionCount ?? 0) + 1)
    if (props.section === 'monitor') return
    const [messagesResult, configsResult] = await Promise.all([
      explorerApi.fetchKafkaMessages(props.connectionId, props.topic, {
        partition: partition.value ?? undefined,
        limit: 50,
        fromBeginning: fromBeginning.value,
      }),
      explorerApi.fetchKafkaTopicConfigs(props.connectionId, props.topic).catch(() => null),
    ])
    messages.value = messagesResult.messages
    selectedIndex.value = messagesResult.messages.length ? 0 : null
    configs.value = configsResult
    syncRetentionInputs(configsResult)
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaMessages.loadFailed')
    detail.value = null
    configs.value = null
    messages.value = []
    selectedIndex.value = null
  } finally {
    loading.value = false
  }
}

function selectMessage(index: number) {
  selectedIndex.value = index
}

async function copyText(text: string, toastKey: 'copyValue' | 'copyKey' = 'copyValue') {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // ignore clipboard failures
  }
}

function useSelectedInProducer() {
  if (!selectedMessage.value) return
  emit('useInProducer', {
    key: selectedMessage.value.key ?? '',
    value: selectedMessage.value.value ?? '',
    partition: selectedMessage.value.partition,
  })
}

async function saveRetention() {
  if (!props.connectionId || !props.topic) return
  const retentionMs = retentionMsInput.value.trim() === '' ? null : Number(retentionMsInput.value)
  const retentionBytes = retentionBytesInput.value.trim() === '' ? null : Number(retentionBytesInput.value)
  if (retentionMs != null && !Number.isFinite(retentionMs)) {
    error.value = t('explorer.kafkaPolicies.invalidRetentionMs')
    return
  }
  if (retentionBytes != null && !Number.isFinite(retentionBytes)) {
    error.value = t('explorer.kafkaPolicies.invalidRetentionBytes')
    return
  }
  if (retentionMs == null && retentionBytes == null) {
    error.value = t('explorer.kafkaPolicies.needValue')
    return
  }
  configsSaving.value = true
  error.value = null
  try {
    await explorerApi.updateKafkaTopicConfigs(props.connectionId, props.topic, {
      retentionMs,
      retentionBytes,
    })
    configs.value = await explorerApi.fetchKafkaTopicConfigs(props.connectionId, props.topic)
    syncRetentionInputs(configs.value)
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaPolicies.saveFailed')
  } finally {
    configsSaving.value = false
  }
}

async function increasePartitions() {
  if (!props.connectionId || !props.topic || !detail.value) return
  const next = Number(newPartitionCount.value)
  if (!Number.isFinite(next) || next <= detail.value.partitionCount) {
    error.value = t('explorer.kafkaTopicAdmin.invalidPartitions')
    return
  }
  partitionsSaving.value = true
  error.value = null
  try {
    await explorerApi.increaseKafkaTopicPartitions(props.connectionId, props.topic, next)
    await loadData()
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaTopicAdmin.partitionsFailed')
  } finally {
    partitionsSaving.value = false
  }
}

watch(
    () => [props.connectionId, props.topic] as const,
    () => {
      detail.value = null
      configs.value = null
      partition.value = null
      fromBeginning.value = false
      messageFilter.value = ''
      messageOrder.value = 'newest'
      void loadData()
    },
    {immediate: true},
)

watch(
    () => [partition.value, fromBeginning.value] as const,
    () => {
      if (!props.connectionId || !props.topic || loading.value) return
      void loadMessages()
    },
)

watch(displayedMessages, (rows) => {
  if (!rows.length) {
    selectedIndex.value = null
    return
  }
  if (selectedIndex.value == null || selectedIndex.value >= rows.length) {
    selectedIndex.value = 0
  }
})

defineExpose({refresh: loadData})
</script>

<template>
  <section class="kafka-topic-detail-panel">
    <header class="kafka-topic-detail-panel__head">
      <div class="kafka-topic-detail-panel__title">
        <div class="kafka-topic-detail-panel__title-row">
          <h3>{{ sectionTitle }}</h3>
          <span v-if="detail" class="kafka-topic-detail-panel__badge">
            {{ t('explorer.kafkaMessages.partitionsBadge', {count: detail.partitionCount}) }}
          </span>
          <span v-if="detail" class="kafka-topic-detail-panel__badge is-muted">
            RF {{ detail.replicationFactor }}
          </span>
        </div>
        <p class="kafka-topic-detail-panel__topic">{{ topic }}</p>
      </div>

      <div class="kafka-topic-detail-panel__head-actions">
        <DwButton variant="secondary" size="sm" :loading="isBusy" :disabled="isBusy" @click="loadData">
          {{ isBusy ? t('explorer.kafkaMessages.loading') : t('explorer.kafkaMessages.refresh') }}
        </DwButton>
      </div>
    </header>

    <section v-if="props.section === 'monitor' && detail && overview" class="kafka-topic-detail-panel__monitor">
      <div class="kafka-topic-detail-panel__stats">
        <div class="kafka-topic-detail-panel__stat">
          <span>{{ t('explorer.kafkaMessages.statPartitions') }}</span>
          <strong>{{ overview.partitionCount }}</strong>
        </div>
        <div class="kafka-topic-detail-panel__stat">
          <span>{{ t('explorer.kafkaMessages.statReplication') }}</span>
          <strong>{{ overview.replicationFactor }}</strong>
        </div>
        <div class="kafka-topic-detail-panel__stat">
          <span>{{ t('explorer.kafkaMessages.statMessages') }}</span>
          <strong>{{ overview.totalMessages }}</strong>
        </div>
        <div class="kafka-topic-detail-panel__stat" :class="{ 'is-warn': overview.underReplicated > 0 }">
          <span>{{ t('explorer.kafkaMessages.statHealthy') }}</span>
          <strong>{{ overview.healthy }} / {{ overview.partitionCount }}</strong>
        </div>
        <div class="kafka-topic-detail-panel__stat" :class="{ 'is-warn': overview.offline > 0 }">
          <span>{{ t('explorer.kafkaMessages.statOffline') }}</span>
          <strong>{{ overview.offline }}</strong>
        </div>
      </div>

      <div class="kafka-topic-detail-panel__table-wrap">
        <table class="kafka-topic-detail-panel__table">
          <thead>
            <tr>
              <th>{{ t('explorer.kafkaMessages.colPartition') }}</th>
              <th>{{ t('explorer.kafkaMessages.colLeader') }}</th>
              <th>{{ t('explorer.kafkaMessages.colReplicas') }}</th>
              <th>{{ t('explorer.kafkaMessages.colIsr') }}</th>
              <th>{{ t('explorer.kafkaMessages.colBegin') }}</th>
              <th>{{ t('explorer.kafkaMessages.colEnd') }}</th>
              <th>{{ t('explorer.kafkaMessages.colCount') }}</th>
              <th>{{ t('explorer.kafkaMessages.colHealth') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
                v-for="row in detail.partitions"
                :key="row.partition"
                :class="{ 'is-warn': !isKafkaPartitionHealthy(row) }"
            >
              <td>{{ row.partition }}</td>
              <td>{{ row.leader < 0 ? '—' : row.leader }}</td>
              <td>{{ row.replicas.join(',') || '—' }}</td>
              <td>{{ row.isr.join(',') || '—' }}</td>
              <td>{{ row.beginningOffset }}</td>
              <td>{{ row.endOffset }}</td>
              <td>{{ kafkaPartitionMessageCount(row) }}</td>
              <td>
                {{ isKafkaPartitionHealthy(row)
                  ? t('explorer.kafkaMessages.healthOk')
                  : t('explorer.kafkaMessages.healthWarn') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="kafka-topic-detail-panel__admin-row">
        <label class="kafka-topic-detail-panel__inline-field">
          <span>{{ t('explorer.kafkaTopicAdmin.partitions') }}</span>
          <DwInput v-model="newPartitionCount" variant="sm" type="number" min="1"/>
        </label>
        <DwButton variant="secondary" size="sm" :loading="partitionsSaving" :disabled="partitionsSaving" @click="increasePartitions">
          {{ t('explorer.kafkaTopicAdmin.increasePartitions') }}
        </DwButton>
      </div>
    </section>

    <EmptyState
        v-else-if="props.section === 'monitor' && isBusy && !detail"
        embedded
        bordered
        :title="t('explorer.kafkaMessages.loading')"
    />
    <DwInlineAlert v-else-if="props.section === 'monitor' && error" :message="error"/>

    <section v-if="props.section === 'policies'" class="kafka-topic-detail-panel__monitor">
      <DwInlineAlert v-if="error" :message="error"/>
      <div class="kafka-topic-detail-panel__admin-row">
        <label class="kafka-topic-detail-panel__inline-field">
          <span>{{ t('explorer.kafkaPolicies.retentionMs') }}</span>
          <DwInput v-model="retentionMsInput" variant="sm" type="text" :placeholder="t('explorer.kafkaPolicies.retentionMsPlaceholder')"/>
        </label>
        <label class="kafka-topic-detail-panel__inline-field">
          <span>{{ t('explorer.kafkaPolicies.retentionBytes') }}</span>
          <DwInput v-model="retentionBytesInput" variant="sm" type="text" :placeholder="t('explorer.kafkaPolicies.retentionBytesPlaceholder')"/>
        </label>
        <DwButton variant="secondary" size="sm" :loading="configsSaving" :disabled="configsSaving" @click="saveRetention">
          {{ t('explorer.kafkaPolicies.save') }}
        </DwButton>
      </div>
    </section>

    <div v-if="props.section === 'messages'" class="kafka-topic-detail-panel__consume-bar">
      <div class="kafka-topic-detail-panel__consume-main">
        <div class="kafka-topic-detail-panel__consume-grid">
          <label class="kafka-topic-detail-panel__field-block">
            <span class="kafka-topic-detail-panel__field-label">{{ t('explorer.kafkaMessages.partition') }}</span>
            <DwSelect
                v-model="partitionSelect"
                size="sm"
                :options="partitionSelectOptions"
                :disabled="isBusy"
            />
          </label>

          <label class="kafka-topic-detail-panel__field-block">
            <span class="kafka-topic-detail-panel__field-label">{{ t('explorer.kafkaMessages.offsetMode') }}</span>
            <DwSelect
                v-model="offsetMode"
                size="sm"
                :options="offsetModeOptions"
                :disabled="isBusy"
            />
          </label>

          <label class="kafka-topic-detail-panel__field-block">
            <span class="kafka-topic-detail-panel__field-label">{{ t('explorer.kafkaMessages.order') }}</span>
            <DwSelect
                v-model="messageOrder"
                size="sm"
                :options="messageOrderOptions"
                :disabled="isBusy"
            />
          </label>

          <label class="kafka-topic-detail-panel__field-block kafka-topic-detail-panel__field-block--grow">
            <span class="kafka-topic-detail-panel__field-label">{{ t('explorer.kafkaMessages.filter') }}</span>
            <DwInput
                v-model="messageFilter"
                variant="sm"
                type="search"
                :placeholder="t('explorer.kafkaMessages.filterPlaceholder')"
            />
          </label>
        </div>
      </div>

      <aside class="kafka-topic-detail-panel__consume-aside">
        <span v-if="messages.length" class="kafka-topic-detail-panel__match-pill">
          {{ displayedMessages.length }}
          <span aria-hidden="true">/</span>
          {{ messages.length }}
        </span>
        <div class="kafka-topic-detail-panel__message-actions">
          <DwButton
              variant="ghost"
              size="sm"
              :disabled="!selectedMessage"
              @click="copyText(selectedMessage?.key ?? '', 'copyKey')"
          >
            {{ t('explorer.kafkaMessages.copyKey') }}
          </DwButton>
          <DwButton
              variant="ghost"
              size="sm"
              :disabled="!selectedMessage"
              @click="copyText(selectedValue)"
          >
            {{ t('explorer.kafkaMessages.copyValue') }}
          </DwButton>
          <DwButton
              variant="secondary"
              size="sm"
              :disabled="!selectedMessage"
              @click="useSelectedInProducer"
          >
            {{ t('explorer.kafkaMessages.reuseInProducer') }}
          </DwButton>
        </div>
      </aside>
    </div>

    <div v-if="props.section === 'messages'" class="kafka-topic-detail-panel__body">
      <DwInlineAlert v-if="error" :message="error"/>

      <EmptyState
          v-else-if="isBusy && !messages.length"
          embedded
          bordered
          :title="t('explorer.kafkaMessages.loading')"
      />

      <EmptyState
          v-else-if="!displayedMessages.length && messageFilter.trim()"
          embedded
          bordered
          :title="t('explorer.kafkaMessages.noMatches')"
      />

      <EmptyState
          v-else-if="!messages.length"
          embedded
          bordered
          :title="t('explorer.kafkaMessages.empty')"
          :description="t('explorer.kafkaMessages.emptyHint')"
      />

      <template v-else>
        <div class="kafka-topic-detail-panel__workspace">
          <div class="kafka-topic-detail-panel__list" role="listbox">
            <div class="kafka-topic-detail-panel__list-head" aria-hidden="true">
              <span>{{ t('explorer.kafkaMessages.colPartition') }}</span>
              <span>{{ t('explorer.kafkaMessages.colOffset') }}</span>
              <span>{{ t('explorer.kafkaMessages.colTimestamp') }}</span>
              <span>{{ t('explorer.kafkaMessages.colKey') }}</span>
              <span>{{ t('explorer.kafkaMessages.colValue') }}</span>
            </div>
            <button
                v-for="(message, index) in displayedMessages"
                :key="`${message.partition}-${message.offset}-${index}`"
                type="button"
                class="kafka-topic-detail-panel__row"
                :class="{ 'is-selected': selectedIndex === index }"
                role="option"
                :aria-selected="selectedIndex === index"
                @click="selectMessage(index)"
            >
              <span class="kafka-topic-detail-panel__row-part">#{{ message.partition }}</span>
              <span class="kafka-topic-detail-panel__row-offset">@{{ message.offset }}</span>
              <span class="kafka-topic-detail-panel__row-time">{{ formatMessageTimestamp(message.timestamp) }}</span>
              <span class="kafka-topic-detail-panel__row-key">
                {{ message.key || t('explorer.kafkaMessages.noKey') }}
              </span>
              <span class="kafka-topic-detail-panel__row-preview">
                {{ summarizeMessageValue(message.value, 96) }}
              </span>
            </button>
          </div>

          <section class="kafka-topic-detail-panel__value-section">
            <header class="kafka-topic-detail-panel__value-head">
              <div class="kafka-topic-detail-panel__value-title">
                <span class="kafka-topic-detail-panel__value-label">{{ t('explorer.kafkaMessages.colValue') }}</span>
                <span v-if="selectedValueIsJson" class="kafka-topic-detail-panel__value-badge">JSON</span>
              </div>
              <div v-if="selectedMessage" class="kafka-topic-detail-panel__value-meta">
                <span>{{ partitionLabel }}</span>
                <span>{{ offsetLabel }}</span>
                <span>{{ timeLabel }}</span>
                <span class="kafka-topic-detail-panel__key-value">
                  {{ selectedMessage.key || t('explorer.kafkaMessages.noKey') }}
                </span>
              </div>
            </header>

            <dl
                v-if="selectedMessage?.headers && Object.keys(selectedMessage.headers).length"
                class="kafka-topic-detail-panel__headers"
            >
              <dt>{{ t('explorer.kafkaMessages.headers') }}</dt>
              <dd>
                <div
                    v-for="(headerValue, headerKey) in selectedMessage.headers"
                    :key="headerKey"
                    class="kafka-topic-detail-panel__header-line"
                >
                  <code>{{ headerKey }}</code>: <span>{{ headerValue }}</span>
                </div>
              </dd>
            </dl>

            <pre class="kafka-topic-detail-panel__preview">{{ selectedValue || t('explorer.kafkaMessages.emptyValue') }}</pre>
          </section>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.kafka-topic-detail-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: var(--dw-space-6);
}

.kafka-topic-detail-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-6);
  flex-shrink: 0;
}

.kafka-topic-detail-panel__title {
  flex: 1;
  min-width: 0;
}

.kafka-topic-detail-panel__head-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--dw-gap-sm);
  flex-shrink: 0;
}

.kafka-topic-detail-panel__monitor {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  margin-top: var(--dw-space-5);
  flex-shrink: 0;
}

.kafka-topic-detail-panel__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--dw-gap);
}

.kafka-topic-detail-panel__stat {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-xs);
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 1px solid var(--dw-border);
  background: var(--dw-bg-editor);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.kafka-topic-detail-panel__stat strong {
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
}

.kafka-topic-detail-panel__stat.is-warn strong {
  color: var(--dw-warning);
}

.kafka-topic-detail-panel__table-wrap {
  max-height: 180px;
  overflow: auto;
  border: 1px solid var(--dw-border);
}

.kafka-topic-detail-panel__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-text-xs);
}

.kafka-topic-detail-panel__table th,
.kafka-topic-detail-panel__table td {
  padding: var(--dw-space-2) var(--dw-space-3);
  text-align: left;
  border-bottom: 1px solid var(--dw-border);
  white-space: nowrap;
}

.kafka-topic-detail-panel__table th {
  position: sticky;
  top: 0;
  background: var(--dw-bg-panel);
  color: var(--dw-text-muted);
}

.kafka-topic-detail-panel__table tr.is-warn td {
  color: var(--dw-warning);
}

.kafka-topic-detail-panel__admin-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--dw-gap);
}

.kafka-topic-detail-panel__inline-field--grow {
  flex: 1 1 180px;
}

.kafka-topic-detail-panel__consume-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--dw-space-5);
  margin-top: var(--dw-space-5);
  padding: var(--dw-space-5) var(--dw-space-6);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
  flex-shrink: 0;
}

.kafka-topic-detail-panel__consume-main {
  flex: 1 1 28rem;
  min-width: 0;
}

.kafka-topic-detail-panel__consume-grid {
  display: grid;
  grid-template-columns: minmax(6.5rem, 0.8fr) minmax(8.5rem, 1.1fr) minmax(6.5rem, 0.85fr) minmax(11rem, 1.5fr);
  gap: var(--dw-space-4) var(--dw-space-5);
  align-items: end;
}

.kafka-topic-detail-panel__field-block {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  min-width: 0;
}

.kafka-topic-detail-panel__field-label {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-muted);
}

.kafka-topic-detail-panel__field-block :deep(.dw-select),
.kafka-topic-detail-panel__field-block :deep(.dw-input) {
  width: 100%;
}

.kafka-topic-detail-panel__consume-aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  gap: var(--dw-space-3);
  flex: 0 0 auto;
  padding-bottom: 1px;
}

.kafka-topic-detail-panel__match-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem 0.55rem;
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-family: var(--dw-font-mono);
}

.kafka-topic-detail-panel__message-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--dw-gap-sm);
}

.kafka-topic-detail-panel__inline-field {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

@media (max-width: 1100px) {
  .kafka-topic-detail-panel__consume-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kafka-topic-detail-panel__consume-aside {
    width: 100%;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

@media (max-width: 720px) {
  .kafka-topic-detail-panel__consume-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.kafka-topic-detail-panel__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--dw-gap);
}

.kafka-topic-detail-panel__head h3 {
  margin: 0;
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.kafka-topic-detail-panel__badge {
  padding: 1px var(--dw-space-4);
  border-radius: var(--dw-radius-pill);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  background: color-mix(in srgb, var(--dw-primary) 15%, transparent);
  color: var(--dw-primary);
}

.kafka-topic-detail-panel__badge.is-muted {
  background: color-mix(in srgb, var(--dw-text-muted) 15%, transparent);
  color: var(--dw-text-muted);
}

.kafka-topic-detail-panel__topic {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-text-muted);
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-xs);
  word-break: break-all;
}

.kafka-topic-detail-panel__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  margin-top: var(--dw-space-4);
  gap: var(--dw-gap);
  overflow: hidden;
}

.kafka-topic-detail-panel__workspace {
  display: grid;
  grid-template-rows: minmax(7.5rem, 0.38fr) minmax(0, 1fr);
  gap: var(--dw-space-3);
  flex: 1;
  min-height: 0;
}

.kafka-topic-detail-panel__key-value {
  font-family: var(--dw-font-mono);
  word-break: break-all;
}

.kafka-topic-detail-panel__list {
  --kafka-msg-cols: 3.25rem 5rem minmax(8.5rem, 11rem) minmax(5rem, 9rem) minmax(0, 1fr);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
}

.kafka-topic-detail-panel__list-head,
.kafka-topic-detail-panel__row {
  display: grid;
  grid-template-columns: var(--kafka-msg-cols);
  gap: var(--dw-space-3);
  align-items: center;
  width: 100%;
  padding: var(--dw-space-2) var(--dw-space-5);
  text-align: left;
  font-size: var(--dw-text-xs);
}

.kafka-topic-detail-panel__list-head {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid var(--dw-border);
  background: color-mix(in srgb, var(--dw-bg-panel) 88%, var(--dw-bg-editor));
  color: var(--dw-text-muted);
  font-weight: 600;
}

.kafka-topic-detail-panel__row {
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border) 70%, transparent);
  background: transparent;
  cursor: pointer;
  color: inherit;
}

.kafka-topic-detail-panel__row:last-child {
  border-bottom: none;
}

.kafka-topic-detail-panel__row:hover,
.kafka-topic-detail-panel__row.is-selected {
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.kafka-topic-detail-panel__row-part,
.kafka-topic-detail-panel__row-offset {
  font-family: var(--dw-font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--dw-text);
}

.kafka-topic-detail-panel__row-time {
  color: var(--dw-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kafka-topic-detail-panel__row-key,
.kafka-topic-detail-panel__row-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dw-font-mono);
}

.kafka-topic-detail-panel__row-key {
  color: var(--dw-text-secondary);
}

.kafka-topic-detail-panel__row-preview {
  color: var(--dw-text-muted);
}

@media (max-width: 900px) {
  .kafka-topic-detail-panel__list {
    --kafka-msg-cols: 2.75rem 4.5rem minmax(0, 1fr);
  }

  .kafka-topic-detail-panel__list-head > span:nth-child(n + 4),
  .kafka-topic-detail-panel__row > span:nth-child(n + 4) {
    display: none;
  }
}

.kafka-topic-detail-panel__headers {
  display: grid;
  grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
  gap: var(--dw-gap-sm) var(--dw-gap-md);
  font-size: var(--dw-text-xs);
}

.kafka-topic-detail-panel__headers dt {
  color: var(--dw-text-muted);
}

.kafka-topic-detail-panel__headers dd {
  margin: 0;
}

.kafka-topic-detail-panel__header-line + .kafka-topic-detail-panel__header-line {
  margin-top: var(--dw-space-2);
}

.kafka-topic-detail-panel__value-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-4) var(--dw-space-5);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
}

.kafka-topic-detail-panel__value-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-3) var(--dw-space-5);
  flex-shrink: 0;
}

.kafka-topic-detail-panel__value-title {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-3);
}

.kafka-topic-detail-panel__value-label {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-muted);
  letter-spacing: 0.02em;
}

.kafka-topic-detail-panel__value-badge {
  padding: 1px var(--dw-space-4);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-link) 12%, transparent);
  color: var(--dw-link);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.kafka-topic-detail-panel__value-meta {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-2);
  min-width: 0;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--dw-text-muted);
}

.kafka-topic-detail-panel__value-meta > span {
  display: inline-flex;
  align-items: center;
  max-width: 18rem;
  padding: 0.15rem 0.45rem;
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-text) 5%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kafka-topic-detail-panel__value-meta > span:first-child,
.kafka-topic-detail-panel__value-meta > span:nth-child(2) {
  color: var(--dw-text);
  font-weight: 600;
}

.kafka-topic-detail-panel__preview {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  padding: var(--dw-space-5);
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-bg) 55%, var(--dw-bg-editor));
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
  white-space: pre-wrap;
  word-break: break-word;
  tab-size: 2;
}
</style>
