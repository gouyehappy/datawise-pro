<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {WorkspaceTab} from '@/core/types'
import {WorkbenchListPage} from '@/core/components'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import KafkaTablePublishPanel from '@/features/workspace/components/kafka/KafkaTablePublishPanel.vue'
import type {KafkaTablePublishContext} from '@/features/explorer/services/kafka-table-publish.service'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()

const kafkaConnectionId = computed(() => props.tab.connectionId ?? '')
const lockKafkaConnection = computed(() => props.tab.params?.kafkaPublishLockConnection === true)

const connectionLabel = computed(() => {
  if (!kafkaConnectionId.value) return ''
  return explorer.findNode(kafkaConnectionId.value)?.label ?? kafkaConnectionId.value
})

const presetSource = computed<KafkaTablePublishContext | null>(() => {
  const sourceConnectionId = props.tab.params?.kafkaPublishSourceConnectionId
  const database = props.tab.database
  const tableName = props.tab.tableName
  if (!sourceConnectionId || !database || !tableName) return null
  const sourceConnectionLabel = explorer.findNode(sourceConnectionId)?.label ?? sourceConnectionId
  return {
    sourceConnectionId,
    sourceConnectionLabel,
    sourceDatabase: database,
    tableName,
  }
})

const subtitle = computed(() => {
  if (presetSource.value) {
    return `${presetSource.value.sourceConnectionLabel} · ${presetSource.value.sourceDatabase}.${presetSource.value.tableName}`
  }
  return connectionLabel.value || t('explorer.kafkaTablePublish.noConnection')
})
</script>

<template>
  <WorkbenchListPage
      content-class="kafka-table-publish-tab"
      recipe="wb-single"
      :title="t('explorer.kafkaTablePublish.title')"
      :subtitle="subtitle"
  >
    <KafkaTablePublishPanel
        class="dw-workbench-list-page__fill"
        :kafka-connection-id="kafkaConnectionId || undefined"
        :lock-kafka-connection="lockKafkaConnection"
        :preset-source="presetSource"
    />
  </WorkbenchListPage>
</template>

<style scoped>
.kafka-table-publish-tab {
  min-width: 0;
  min-height: 0;
}

.kafka-table-publish-tab :deep(.dw-workbench-list-page__body) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
