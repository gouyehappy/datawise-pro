<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {WorkbenchListPage} from '@/core/components'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import KafkaConsumerGroupPanel from '@/features/workspace/components/kafka/KafkaConsumerGroupPanel.vue'
import type {WorkspaceTab} from '@/core/types'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()
const consumerGroupPanelRef = ref<InstanceType<typeof KafkaConsumerGroupPanel> | null>(null)
const topicFilter = ref(props.tab.params?.kafkaTopic ?? '')

watch(
    () => props.tab.params?.kafkaTopic ?? '',
    (next) => {
      topicFilter.value = next
    },
)

const connectionId = computed(() => props.tab.connectionId ?? '')
const connectionLabel = computed(() => {
  if (!connectionId.value) return t('explorer.kafkaConsumerGroups.noConnection')
  return explorer.findNode(connectionId.value)?.label ?? connectionId.value
})

function refresh() {
  consumerGroupPanelRef.value?.refresh()
}
</script>

<template>
  <WorkbenchListPage
      content-class="kafka-consumer-groups-tab"
      recipe="wb-single"
      :title="t('explorer.kafkaConsumerGroups.title')"
      :subtitle="connectionLabel"
  >
    <template #actions>
      <button class="dw-text-btn" type="button" @click="refresh">
        {{ t('explorer.kafkaConsumerGroup.reloadGroups') }}
      </button>
    </template>
    <KafkaConsumerGroupPanel
        ref="consumerGroupPanelRef"
        class="dw-workbench-list-page__fill"
        :connection-id="connectionId"
        :topic="topicFilter"
        show-topic-filter
    />
  </WorkbenchListPage>
</template>
