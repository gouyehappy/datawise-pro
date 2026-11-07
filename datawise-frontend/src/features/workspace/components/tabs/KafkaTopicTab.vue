<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState, WorkbenchListPage} from '@/core/components'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import KafkaMessagesPanel from '@/features/workspace/components/kafka/KafkaMessagesPanel.vue'
import KafkaProducerPanel from '@/features/workspace/components/kafka/KafkaProducerPanel.vue'
import type {WorkspaceTab} from '@/core/types'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()

const messagesPanelRef = ref<InstanceType<typeof KafkaMessagesPanel> | null>(null)
const producerPanelRef = ref<InstanceType<typeof KafkaProducerPanel> | null>(null)

const connectionId = computed(() => props.tab.connectionId ?? '')
const topic = computed(() => props.tab.params?.kafkaTopic ?? '')

const connectionLabel = computed(() => {
  if (!connectionId.value) return t('explorer.kafkaTopic.noConnection')
  return explorer.findNode(connectionId.value)?.label ?? connectionId.value
})

const pageTitle = computed(() => topic.value || t('explorer.kafkaTopic.title'))

function onProduced() {
  messagesPanelRef.value?.refresh()
}

function onUseInProducer(payload: { key: string; value: string; partition: number }) {
  producerPanelRef.value?.applySeed(payload)
}
</script>

<template>
  <WorkbenchListPage
      content-class="kafka-topic-tab"
      recipe="wb-single"
      body-padding="flush"
      title-class="dw-workbench-page__title--break"
      :title="pageTitle"
      :subtitle="connectionLabel"
  >
    <div v-if="topic" class="kafka-topic-tab__body">
      <KafkaMessagesPanel
          ref="messagesPanelRef"
          class="kafka-topic-tab__messages"
          :connection-id="connectionId"
          :topic="topic"
          @use-in-producer="onUseInProducer"
      />

      <section class="kafka-topic-tab__producer">
        <header class="kafka-topic-tab__producer-head">
          <h3>{{ t('explorer.kafkaTopic.producerTitle') }}</h3>
        </header>
        <KafkaProducerPanel
            ref="producerPanelRef"
            class="kafka-topic-tab__producer-panel"
            :connection-id="connectionId"
            :topic="topic"
            @produced="onProduced"
        />
      </section>
    </div>

    <EmptyState
        v-else
        class="kafka-topic-tab__empty"
        :title="t('explorer.kafkaTopic.emptyHint')"
    />
  </WorkbenchListPage>
</template>

<style scoped>
.kafka-topic-tab {
  min-width: 0;
}

.kafka-topic-tab__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: var(--dw-space-5);
  gap: var(--dw-gap-md);
}

.kafka-topic-tab__messages {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.kafka-topic-tab__producer {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 200px;
  max-height: 42%;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
  overflow: hidden;
}

.kafka-topic-tab__producer-head {
  padding: var(--dw-space-3) var(--dw-space-5);
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  background: transparent;
}

.kafka-topic-tab__producer-head h3 {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.kafka-topic-tab__producer-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: var(--dw-space-4) var(--dw-space-5) var(--dw-space-5);
}

.kafka-topic-tab__empty {
  flex: 1;
}
</style>
