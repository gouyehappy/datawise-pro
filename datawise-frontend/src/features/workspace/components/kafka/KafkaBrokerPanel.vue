<script setup lang="ts">
import {onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, EmptyState} from '@/core/components'
import {explorerApi} from '@/api'
import type {KafkaClusterInfo} from '@/features/explorer/services/kafka-topic.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
  connectionId: string
}>()

const {t} = useI18n()

const info = ref<KafkaClusterInfo | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function load() {
  if (!props.connectionId) return
  loading.value = true
  error.value = null
  try {
    info.value = await explorerApi.fetchKafkaClusterInfo(props.connectionId)
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.kafkaBroker.loadFailed')
    info.value = null
  } finally {
    loading.value = false
  }
}

watch(() => props.connectionId, () => {
  void load()
})

onMounted(() => {
  void load()
})

defineExpose({refresh: load})
</script>

<template>
  <div class="kafka-broker-panel">
    <div class="kafka-broker-panel__toolbar">
      <div class="kafka-broker-panel__meta" v-if="info">
        <span>{{ t('explorer.kafkaBroker.clusterId') }}: {{ info.clusterId || '—' }}</span>
        <span>{{ t('explorer.kafkaBroker.controller') }}: {{ info.controllerId < 0 ? '—' : info.controllerId }}</span>
        <span>{{ t('explorer.kafkaBroker.brokerCount', {count: info.brokers.length}) }}</span>
      </div>
      <DwButton variant="secondary" size="sm" :loading="loading" :disabled="loading || !connectionId" @click="load">
        {{ t('common.refresh') }}
      </DwButton>
    </div>

    <DwInlineAlert v-if="error" :message="error"/>

    <EmptyState
        v-else-if="loading && !info"
        embedded
        bordered
        :title="t('explorer.kafkaBroker.loading')"
    />

    <EmptyState
        v-else-if="info && !info.brokers.length"
        embedded
        bordered
        :title="t('explorer.kafkaBroker.empty')"
    />

    <div v-else-if="info" class="kafka-broker-panel__table-wrap">
      <table class="kafka-broker-panel__table">
        <thead>
          <tr>
            <th>{{ t('explorer.kafkaBroker.colId') }}</th>
            <th>{{ t('explorer.kafkaBroker.colHost') }}</th>
            <th>{{ t('explorer.kafkaBroker.colPort') }}</th>
            <th>{{ t('explorer.kafkaBroker.colRack') }}</th>
            <th>{{ t('explorer.kafkaBroker.colRole') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
              v-for="broker in info.brokers"
              :key="broker.id"
              :class="{ 'is-controller': broker.id === info.controllerId }"
          >
            <td>{{ broker.id }}</td>
            <td>{{ broker.host }}</td>
            <td>{{ broker.port }}</td>
            <td>{{ broker.rack || '—' }}</td>
            <td>
              <span v-if="broker.id === info.controllerId" class="kafka-broker-panel__badge">
                {{ t('explorer.kafkaBroker.controllerBadge') }}
              </span>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.kafka-broker-panel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  padding: var(--dw-space-5) var(--dw-space-6) var(--dw-space-6);
}

.kafka-broker-panel__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  flex-shrink: 0;
}

.kafka-broker-panel__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-md);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.kafka-broker-panel__table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--dw-border);
}

.kafka-broker-panel__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-text-sm);
}

.kafka-broker-panel__table th,
.kafka-broker-panel__table td {
  padding: var(--dw-space-3) var(--dw-space-4);
  text-align: left;
  border-bottom: 1px solid var(--dw-border);
}

.kafka-broker-panel__table th {
  position: sticky;
  top: 0;
  background: var(--dw-bg-panel);
  color: var(--dw-text-muted);
  font-weight: 600;
  font-size: var(--dw-text-xs);
}

.kafka-broker-panel__table tr.is-controller td {
  color: var(--dw-primary);
}

.kafka-broker-panel__badge {
  display: inline-flex;
  padding: 0 var(--dw-space-3);
  border: 1px solid var(--dw-primary);
  border-radius: var(--dw-wb-control-radius);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
}

html[data-ui-skin='ide'] .kafka-broker-panel__badge {
  border-radius: 0;
}
</style>
