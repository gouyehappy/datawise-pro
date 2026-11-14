<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwSplitPane} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import ConnectorWorkbenchFrame from '@/features/workspace/components/shared/ConnectorWorkbenchFrame.vue'
import CapabilityProbeBanner from '@/features/workspace/components/shared/CapabilityProbeBanner.vue'
import '@/features/workspace/components/shared/connector-browse-panel.css'
import KafkaTopicsBrowser from '@/features/workspace/components/kafka/KafkaTopicsBrowser.vue'
import KafkaMessagesPanel from '@/features/workspace/components/kafka/KafkaMessagesPanel.vue'
import KafkaProducerPanel from '@/features/workspace/components/kafka/KafkaProducerPanel.vue'
import KafkaConsumerGroupPanel from '@/features/workspace/components/kafka/KafkaConsumerGroupPanel.vue'
import KafkaBrokerPanel from '@/features/workspace/components/kafka/KafkaBrokerPanel.vue'
import {useCapabilityProbe} from '@/features/workspace/composables/useCapabilityProbe'
import type {WorkspaceTab} from '@/core/types'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()

type KafkaHomeView = 'topics' | 'groups' | 'broker'
type KafkaTopicDetailView = 'messages' | 'monitor' | 'subscriptions' | 'policies'

const view = ref<KafkaHomeView>('topics')
const detailView = ref<KafkaTopicDetailView>('messages')
const selectedTopic = ref<string | null>(props.tab.params?.kafkaTopic ?? null)
const messagesPanelRef = ref<InstanceType<typeof KafkaMessagesPanel> | null>(null)
const producerPanelRef = ref<InstanceType<typeof KafkaProducerPanel> | null>(null)
const topicsRef = ref<InstanceType<typeof KafkaTopicsBrowser> | null>(null)
const groupsRef = ref<InstanceType<typeof KafkaConsumerGroupPanel> | null>(null)
const subscriptionsRef = ref<InstanceType<typeof KafkaConsumerGroupPanel> | null>(null)
const brokerRef = ref<InstanceType<typeof KafkaBrokerPanel> | null>(null)
const monitorRef = ref<InstanceType<typeof KafkaMessagesPanel> | null>(null)
const policiesRef = ref<InstanceType<typeof KafkaMessagesPanel> | null>(null)
const producerCollapsed = ref(false)

const connectionId = computed(() => props.tab.connectionId ?? '')
const dbType = computed(() => {
  const node = connectionId.value ? explorer.findNode(connectionId.value) : null
  return String(node?.dbType || props.tab.dbType || 'kafka')
})
const {probe, probing, surfaceOk, isLive, refresh: refreshProbe} = useCapabilityProbe({
  connectionId,
  dbType,
})
/** 集群不可达时隐藏；mutate=unknown 仍展示（不因未知 ACL 误伤）。 */
const showProducer = computed(() => surfaceOk.value && isLive('mutate'))

const connectionLabel = computed(() => {
  if (!connectionId.value) return t('explorer.kafkaConsole.noConnection')
  return explorer.findNode(connectionId.value)?.label ?? connectionId.value
})

function onSelectTopic(topic: string) {
  selectedTopic.value = topic
  workspace.updateTabContext(props.tab.id, {kafkaTopic: topic})
}

function onProduced() {
  messagesPanelRef.value?.refresh()
}

function onUseInProducer(payload: { key: string; value: string; partition: number }) {
  producerPanelRef.value?.applySeed(payload)
  producerCollapsed.value = false
  view.value = 'topics'
  detailView.value = 'messages'
}

function refresh() {
  void refreshProbe()
  if (view.value === 'groups') {
    groupsRef.value?.refresh()
    return
  }
  if (view.value === 'broker') {
    brokerRef.value?.refresh()
    return
  }
  topicsRef.value?.refresh()
  if (detailView.value === 'monitor') monitorRef.value?.refresh()
  else if (detailView.value === 'policies') policiesRef.value?.refresh()
  else if (detailView.value === 'subscriptions') subscriptionsRef.value?.refresh()
  else messagesPanelRef.value?.refresh()
}

watch(
    () => props.tab.params?.kafkaTopic,
    (topic) => {
      if (topic) selectedTopic.value = topic
    },
)

watch(connectionId, () => {
  selectedTopic.value = null
  view.value = 'topics'
  detailView.value = 'messages'
})
</script>

<template>
  <ConnectorWorkbenchFrame :endpoint="connectionLabel" class="kafka-home">
    <template #icon>
      <DwIcon name="tab-kafka" size="md"/>
    </template>
    <template #actions>
      <button class="dw-text-btn" type="button" @click="refresh">
        {{ t('common.refresh') }}
      </button>
    </template>
    <template #tabs>
      <button type="button" :class="{ 'is-active': view === 'topics' }" @click="view = 'topics'">
        {{ t('explorer.kafkaConsole.tabs.topics') }}
      </button>
      <button type="button" :class="{ 'is-active': view === 'groups' }" @click="view = 'groups'">
        {{ t('explorer.kafkaConsole.tabs.groups') }}
      </button>
      <button type="button" :class="{ 'is-active': view === 'broker' }" @click="view = 'broker'">
        {{ t('explorer.kafkaConsole.tabs.broker') }}
      </button>
    </template>

    <CapabilityProbeBanner :probe="probe" :probing="probing"/>

    <DwSplitPane
        v-show="view === 'topics' && surfaceOk"
        class="connector-workbench__panel connector-workbench-pane kafka-home__split"
        storage-key="dw.split.kafka-topics"
        :default-width="300"
        :min-width="220"
        :max-width="520"
        :end-min-width="320"
        :stack-below="900"
        start-class="kafka-home__topics-pane connector-browse-panel__pane"
        end-class="kafka-home__detail-pane connector-browse-panel__pane"
    >
      <template #start>
        <KafkaTopicsBrowser
            ref="topicsRef"
            class="kafka-home__topics"
            :connection-id="connectionId"
            :selected-topic="selectedTopic"
            embedded
            @select="onSelectTopic"
        />
      </template>
      <template #end>
        <div v-if="selectedTopic" class="connector-workbench__tabs kafka-home__detail-tabs">
          <button type="button" :class="{ 'is-active': detailView === 'messages' }" @click="detailView = 'messages'">
            {{ t('explorer.kafkaConsole.tabs.messages') }}
          </button>
          <button type="button" :class="{ 'is-active': detailView === 'monitor' }" @click="detailView = 'monitor'">
            {{ t('explorer.kafkaConsole.tabs.monitor') }}
          </button>
          <button type="button" :class="{ 'is-active': detailView === 'subscriptions' }" @click="detailView = 'subscriptions'">
            {{ t('explorer.kafkaConsole.tabs.subscriptions') }}
          </button>
          <button type="button" :class="{ 'is-active': detailView === 'policies' }" @click="detailView = 'policies'">
            {{ t('explorer.kafkaConsole.tabs.policies') }}
          </button>
        </div>

        <div v-if="!selectedTopic" class="dw-workbench-empty">
          <h3>{{ t('explorer.kafkaConsole.emptyTitle') }}</h3>
          <p>{{ t('explorer.kafkaConsole.emptyHint') }}</p>
          <ul class="dw-workbench-empty__tips">
            <li>{{ t('explorer.kafkaConsole.emptyTipBrowse') }}</li>
            <li>{{ t('explorer.kafkaConsole.emptyTipPeek') }}</li>
            <li>{{ t('explorer.kafkaConsole.emptyTipProduce') }}</li>
          </ul>
        </div>

        <div v-else class="kafka-home__detail-body">
          <KafkaMessagesPanel
              v-if="detailView === 'messages'"
              ref="messagesPanelRef"
              class="kafka-home__messages"
              :connection-id="connectionId"
              :topic="selectedTopic"
              section="messages"
              @use-in-producer="onUseInProducer"
          />
          <KafkaMessagesPanel
              v-else-if="detailView === 'monitor'"
              ref="monitorRef"
              class="kafka-home__messages"
              :connection-id="connectionId"
              :topic="selectedTopic"
              section="monitor"
          />
          <KafkaConsumerGroupPanel
              v-else-if="detailView === 'subscriptions'"
              ref="subscriptionsRef"
              :connection-id="connectionId"
              :topic="selectedTopic"
              mode="topic"
          />
          <KafkaMessagesPanel
              v-else
              ref="policiesRef"
              class="kafka-home__messages"
              :connection-id="connectionId"
              :topic="selectedTopic"
              section="policies"
          />

          <section
              v-if="detailView === 'messages' && showProducer"
              class="kafka-home__producer"
              :class="{ 'is-collapsed': producerCollapsed }"
          >
            <header class="dw-workbench-drawer__head">
              <h3>{{ t('explorer.kafkaConsole.producerTitle') }}</h3>
              <button
                  class="dw-workbench-drawer__toggle"
                  type="button"
                  @click="producerCollapsed = !producerCollapsed"
              >
                {{ producerCollapsed ? t('explorer.kafkaConsole.showProducer') : t('explorer.kafkaConsole.hideProducer') }}
              </button>
            </header>
            <KafkaProducerPanel
                v-show="!producerCollapsed"
                ref="producerPanelRef"
                class="kafka-home__producer-body"
                :connection-id="connectionId"
                :topic="selectedTopic"
                @produced="onProduced"
            />
          </section>
        </div>
      </template>
    </DwSplitPane>

    <div v-show="view === 'groups' && surfaceOk" class="connector-workbench__panel kafka-home__panel">
      <KafkaConsumerGroupPanel
          ref="groupsRef"
          :connection-id="connectionId"
          mode="cluster"
      />
    </div>

    <div v-show="view === 'broker' && surfaceOk" class="connector-workbench__panel kafka-home__panel">
      <KafkaBrokerPanel ref="brokerRef" :connection-id="connectionId"/>
    </div>
  </ConnectorWorkbenchFrame>
</template>

<style scoped>
.kafka-home__split {
  min-height: 0;
  height: 100%;
}

.kafka-home__topics-pane,
.kafka-home__detail-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.kafka-home__detail-pane {
  border-left: 1px solid var(--dw-border);
}

.kafka-home__detail-tabs {
  padding-left: var(--dw-space-4);
  padding-right: var(--dw-space-4);
}

.kafka-home__detail-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.kafka-home__topics,
.kafka-home__messages {
  flex: 1;
  min-height: 0;
}

.kafka-home__messages {
  border-radius: 0;
  box-shadow: none;
  border: 0;
}

.kafka-home__producer {
  flex: 0 0 auto;
  margin: 0 var(--dw-space-6) var(--dw-space-6);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
  overflow: hidden;
}

.kafka-home__producer.is-collapsed {
  margin-bottom: var(--dw-space-5);
}

.kafka-home__producer.is-collapsed .kafka-home__producer-body {
  display: none;
}

.kafka-home__producer :deep(.dw-workbench-drawer__head) {
  padding: var(--dw-space-3) var(--dw-space-5);
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  background: transparent;
}

.kafka-home__producer.is-collapsed :deep(.dw-workbench-drawer__head) {
  border-bottom: none;
}

.kafka-home__producer-body {
  padding: var(--dw-space-4) var(--dw-space-5) var(--dw-space-5);
}

.kafka-home__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.kafka-home__split.dw-split-pane--stacked :deep(.kafka-home__detail-pane) {
  border-left: 0;
  border-top: 1px solid var(--dw-border);
}
</style>
