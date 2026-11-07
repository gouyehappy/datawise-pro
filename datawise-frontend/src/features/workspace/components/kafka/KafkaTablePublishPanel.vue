<script setup lang="ts">
import {computed, markRaw, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {explorerApi} from '@/api'
import {DwButton, DwCheckbox, DwInlineAlert, DwInput} from '@/core/components'
import ConfirmDialog from '@/core/components/ConfirmDialog.vue'
import DwSelect from '@/core/components/DwSelect.vue'
import type {SelectOption} from '@/core/components/select.types'
import {
  DwGraphCanvas,
  type GraphCanvasEdge,
  type GraphCanvasNode,
  type NodeTypesObject,
} from '@/core/graph-canvas'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {PublishTableToKafkaResult} from '@/features/explorer/services/kafka-topic.service'
import {
  aggregatePublishResults,
  buildDefaultKafkaTopicForTable,
  buildKafkaTablePublishContextFromSource,
  buildPublishTableToKafkaRequest,
  createDefaultKafkaTablePublishForm,
  createDefaultKafkaTablePublishSourceForm,
  formatKafkaTablePublishProgress,
  formatKafkaTablePublishSuccess,
  KAFKA_PUBLISH_MAX_INTERVAL_MS,
  KAFKA_PUBLISH_MAX_MESSAGES_CAP,
  listKafkaConnections,
  listPublishSourceConnections,
  resolveKafkaTablePublishErrorMessage,
  type KafkaTablePublishContext,
  type KafkaTablePublishForm,
  type KafkaTablePublishSourceForm,
  validateKafkaTablePublishForm,
  validateKafkaTablePublishSourceForm,
} from '@/features/explorer/services/kafka-table-publish.service'
import {fetchTablesForScope} from '@/features/explorer/services/table-migration.service'
import {
  isKafkaPublishOptionsReady,
  layoutKafkaPublishCanvas,
  nextIncompleteKafkaPublishNode,
  resolveKafkaPublishNodeStatuses,
  type KafkaPublishCanvasNodeKind,
  type KafkaPublishCanvasPositionOverrides,
} from '@/features/workspace/services/kafka-publish-canvas.service'
import KafkaPublishFlowNode from './KafkaPublishFlowNode.vue'

const props = defineProps<{
  kafkaConnectionId?: string
  lockKafkaConnection?: boolean
  presetSource?: KafkaTablePublishContext | null
}>()

const {t} = useI18n()
const explorer = useExplorerStore()

const kafkaConnections = computed(() => listKafkaConnections(explorer.tree))
const needsSourceSelection = computed(() => !props.presetSource)

const form = ref<KafkaTablePublishForm>(
    createDefaultKafkaTablePublishForm(kafkaConnections.value, props.kafkaConnectionId),
)
const sourceForm = ref<KafkaTablePublishSourceForm>(createDefaultKafkaTablePublishSourceForm())
const sourceConnections = computed(() => listPublishSourceConnections(explorer.tree))
const sourceDatabases = computed(() =>
    sourceConnections.value.find((item) => item.id === sourceForm.value.sourceConnectionId)?.databases ?? [],
)
const availableTables = ref<string[]>([])
const tableFilter = ref('')
const databasesLoading = ref(false)
const tablesLoading = ref(false)
const tablesLoadError = ref(false)
const tablesResolved = ref(false)
const topicManual = ref(false)

const publishing = ref(false)
const stopRequested = ref(false)
const datagenSeed = ref(Date.now())
const datagenRowOffset = ref(0)
const liveSent = ref(0)
const liveFailed = ref(0)
const submitError = ref<string | null>(null)
const submitResult = ref<PublishTableToKafkaResult | null>(null)
const submitAttempted = ref(false)
const sendConfirmOpen = ref(false)
const touched = ref({
  sourceConnectionId: false,
  sourceDatabase: false,
  tableName: false,
  kafkaConnectionId: false,
  topic: false,
})

const selectedNodeId = ref<KafkaPublishCanvasNodeKind>('source')
const positionOverrides = ref<KafkaPublishCanvasPositionOverrides>({})
const flowNodes = ref<GraphCanvasNode[]>([])
const flowEdges = ref<GraphCanvasEdge[]>([])
const nodeTypes = {kafkaPublish: markRaw(KafkaPublishFlowNode)} as NodeTypesObject

const sourceConnectionOptions = computed<SelectOption[]>(() =>
    sourceConnections.value.map((item) => ({value: item.id, label: item.label})),
)
const sourceDatabaseOptions = computed<SelectOption[]>(() =>
    sourceDatabases.value.map((item) => ({value: item.label, label: item.label})),
)
const sourceTableOptions = computed<SelectOption[]>(() =>
    availableTables.value.map((name) => ({value: name, label: name})),
)
const kafkaConnectionOptions = computed<SelectOption[]>(() =>
    kafkaConnections.value.map((item) => ({value: item.id, label: item.label})),
)

const resolvedContext = computed(() => {
  if (props.presetSource) return props.presetSource
  if (!needsSourceSelection.value) return null
  return buildKafkaTablePublishContextFromSource(sourceConnections.value, sourceForm.value)
})

const formValidationCode = computed(() => validateKafkaTablePublishForm(form.value, kafkaConnections.value))
const sourceValidationCode = computed(() => {
  if (!needsSourceSelection.value) return null
  return validateKafkaTablePublishSourceForm(sourceForm.value, sourceConnections.value)
})

const validationError = computed(() => {
  const code = formValidationCode.value ?? sourceValidationCode.value
  return code ? t(`explorer.kafkaTablePublish.errors.${code}`) : null
})

const canPublish = computed(() => (
    !validationError.value
    && !publishing.value
    && resolvedContext.value != null
))

const isContinuousRunning = computed(() => publishing.value && form.value.continuous)
const fieldDisabled = computed(() => publishing.value)

const optionsReady = computed(() => isKafkaPublishOptionsReady(form.value))

const statuses = computed(() =>
    resolveKafkaPublishNodeStatuses({
      hasSource: resolvedContext.value != null,
      optionsReady: optionsReady.value,
      kafkaConnectionId: form.value.kafkaConnectionId,
      topic: form.value.topic,
    }),
)

const readyCount = computed(
    () => Object.values(statuses.value).filter((status) => status === 'ready').length,
)

const filteredTables = computed(() => {
  const q = tableFilter.value.trim().toLowerCase()
  if (!q) return availableTables.value
  return availableTables.value.filter((name) => name.toLowerCase().includes(q))
})

const showPalette = computed(() => {
  if (props.presetSource) return false
  return Boolean(sourceForm.value.sourceConnectionId && sourceForm.value.sourceDatabase.trim())
})

const sourceLabel = computed(() => {
  if (resolvedContext.value) return resolvedContext.value.sourceConnectionLabel
  return ''
})

const sourceDetail = computed(() => {
  if (!resolvedContext.value) return ''
  return `${resolvedContext.value.sourceDatabase}.${resolvedContext.value.tableName}`
})

const kafkaLabel = computed(() => {
  const id = form.value.kafkaConnectionId
  return kafkaConnections.value.find((item) => item.id === id)?.label ?? ''
})

const optionsLabel = computed(() => (
    form.value.dataSource === 'fake'
        ? t('explorer.kafkaTablePublish.dataSourceFake')
        : t('explorer.kafkaTablePublish.dataSourceTable')
))

const optionsDetail = computed(() => {
  if (form.value.continuous) {
    return t('explorer.kafkaTablePublish.canvasOptionsBatch', {count: form.value.maxMessages})
  }
  return t('explorer.kafkaTablePublish.canvasOptionsOnce', {count: form.value.maxMessages})
})

const checklistHint = computed(() => {
  const incomplete = nextIncompleteKafkaPublishNode(statuses.value, selectedNodeId.value)
  if (incomplete === 'source') return t('explorer.kafkaTablePublish.canvasHintSource')
  if (incomplete === 'options') return t('explorer.kafkaTablePublish.canvasHintOptions')
  if (incomplete === 'kafka') return t('explorer.kafkaTablePublish.canvasHintKafka')
  return t('explorer.kafkaTablePublish.canvasHintReady')
})

const inspectorTitle = computed(() => {
  const keys: Record<KafkaPublishCanvasNodeKind, string> = {
    source: 'explorer.kafkaTablePublish.canvasInspectorSource',
    options: 'explorer.kafkaTablePublish.canvasInspectorOptions',
    kafka: 'explorer.kafkaTablePublish.canvasInspectorKafka',
  }
  return t(keys[selectedNodeId.value])
})

const sendRulesLines = computed(() => {
  const rules = 'explorer.kafkaTablePublish.sendRules'
  const lines = [t(`${rules}.jsonFormat`)]
  if (form.value.dataSource === 'fake') {
    lines.push(t(form.value.continuous ? `${rules}.fakeContinuous` : `${rules}.fakeSingle`))
  } else {
    lines.push(t(form.value.continuous ? `${rules}.tableContinuous` : `${rules}.tableSingle`))
  }
  if (form.value.continuous) {
    lines.push(t(`${rules}.continuousStop`, {batch: form.value.maxMessages}))
  } else {
    lines.push(t(`${rules}.singleStop`, {max: form.value.maxMessages}))
  }
  if (form.value.intervalMs > 0) {
    lines.push(t(`${rules}.interval`, {ms: form.value.intervalMs}))
  }
  lines.push(t(`${rules}.lockedWhileSending`))
  return lines
})

const maxMessagesHint = computed(() => (
    form.value.continuous
        ? t('explorer.kafkaTablePublish.batchSizeHint')
        : t('explorer.kafkaTablePublish.maxMessagesHint')
))

const maxMessagesLabel = computed(() => (
    form.value.continuous
        ? t('explorer.kafkaTablePublish.batchSize')
        : t('explorer.kafkaTablePublish.maxMessages')
))

const successMessage = computed(() => (
    submitResult.value ? formatKafkaTablePublishSuccess(submitResult.value, t) : null
))

const footerMessage = computed(() => {
  if (submitError.value) return {text: submitError.value, tone: 'error' as const}
  if (isContinuousRunning.value) {
    return {
      text: formatKafkaTablePublishProgress(liveSent.value, liveFailed.value, t),
      tone: 'muted' as const,
    }
  }
  if (successMessage.value) return {text: successMessage.value, tone: 'success' as const}
  if (submitAttempted.value && validationError.value) {
    return {text: validationError.value, tone: 'error' as const}
  }
  return {text: t('explorer.kafkaTablePublish.footerHint'), tone: 'muted' as const}
})

function shouldShowField(field: keyof typeof touched.value) {
  return submitAttempted.value || touched.value[field]
}

function fieldError(field: keyof typeof touched.value, code: string | null) {
  if (!shouldShowField(field) || !code) return null
  return t(`explorer.kafkaTablePublish.errors.${code}`)
}

const sourceConnectionError = computed(() => {
  if (!needsSourceSelection.value) return null
  if (!sourceConnections.value.length) return fieldError('sourceConnectionId', 'noSourceConnections')
  if (!sourceForm.value.sourceConnectionId.trim()) return fieldError('sourceConnectionId', 'sourceConnectionRequired')
  return null
})

const sourceDatabaseError = computed(() => {
  if (!needsSourceSelection.value || !shouldShowField('sourceDatabase')) return null
  if (!sourceForm.value.sourceDatabase.trim()) return t('explorer.kafkaTablePublish.errors.sourceDatabaseRequired')
  return null
})

const sourceTableError = computed(() => {
  if (!needsSourceSelection.value || !shouldShowField('tableName')) return null
  if (!sourceForm.value.tableName.trim()) return t('explorer.kafkaTablePublish.errors.sourceTableRequired')
  return null
})

const kafkaConnectionError = computed(() => {
  if (!shouldShowField('kafkaConnectionId')) return null
  if (!kafkaConnections.value.length) return t('explorer.kafkaTablePublish.errors.noKafkaConnections')
  if (!form.value.kafkaConnectionId.trim()) return t('explorer.kafkaTablePublish.errors.kafkaConnectionRequired')
  return null
})

const topicError = computed(() => {
  if (!shouldShowField('topic')) return null
  if (!form.value.topic.trim()) return t('explorer.kafkaTablePublish.errors.topicRequired')
  return null
})

function touchField(field: keyof typeof touched.value) {
  touched.value[field] = true
}

function applyTopicForTable(tableName: string) {
  if (topicManual.value) return
  form.value.topic = buildDefaultKafkaTopicForTable(tableName)
}

function onTopicInput() {
  topicManual.value = true
  touchField('topic')
}

function applyPresetSource(source: KafkaTablePublishContext | null | undefined) {
  if (!source) {
    sourceForm.value = createDefaultKafkaTablePublishSourceForm()
    return
  }
  sourceForm.value = {
    sourceConnectionId: source.sourceConnectionId,
    sourceDatabase: source.sourceDatabase,
    tableName: source.tableName,
  }
  topicManual.value = false
  applyTopicForTable(source.tableName)
}

function selectNode(kind: KafkaPublishCanvasNodeKind) {
  selectedNodeId.value = kind
}

function goToIncomplete() {
  selectedNodeId.value = nextIncompleteKafkaPublishNode(statuses.value, selectedNodeId.value)
}

function resetLayout() {
  positionOverrides.value = {}
}

function pickTable(name: string) {
  if (fieldDisabled.value || props.presetSource) return
  sourceForm.value.tableName = name
  touchField('tableName')
  applyTopicForTable(name)
  selectNode('source')
}

function onNodeClick(event: {node: {id: string}}) {
  const id = event.node.id as KafkaPublishCanvasNodeKind
  if (id === 'source' || id === 'options' || id === 'kafka') {
    selectNode(id)
  }
}

function onNodeDragStop(event: {node: {id: string; position: {x: number; y: number}}}) {
  positionOverrides.value = {
    ...positionOverrides.value,
    [event.node.id]: {x: event.node.position.x, y: event.node.position.y},
  }
}

function resetFormState() {
  form.value = createDefaultKafkaTablePublishForm(kafkaConnections.value, props.kafkaConnectionId)
  applyPresetSource(props.presetSource)
  availableTables.value = []
  tableFilter.value = ''
  databasesLoading.value = false
  tablesLoading.value = false
  tablesLoadError.value = false
  tablesResolved.value = false
  topicManual.value = false
  stopRequested.value = false
  datagenSeed.value = Date.now()
  datagenRowOffset.value = 0
  liveSent.value = 0
  liveFailed.value = 0
  publishing.value = false
  submitError.value = null
  submitResult.value = null
  submitAttempted.value = false
  positionOverrides.value = {}
  selectedNodeId.value = props.presetSource ? 'kafka' : 'source'
  touched.value = {
    sourceConnectionId: false,
    sourceDatabase: false,
    tableName: false,
    kafkaConnectionId: false,
    topic: false,
  }
}

watch(
    () => [props.kafkaConnectionId, props.presetSource] as const,
    ([kafkaConnectionId, presetSource]) => {
      form.value = createDefaultKafkaTablePublishForm(kafkaConnections.value, kafkaConnectionId)
      applyPresetSource(presetSource)
      submitError.value = null
      submitResult.value = null
      submitAttempted.value = false
      selectedNodeId.value = presetSource ? 'kafka' : 'source'
    },
    {immediate: true},
)

watch(
    kafkaConnections,
    (connections) => {
      if (!form.value.kafkaConnectionId && connections[0]) {
        form.value.kafkaConnectionId = connections[0].id
      }
      if (props.kafkaConnectionId && connections.some((item) => item.id === props.kafkaConnectionId)) {
        form.value.kafkaConnectionId = props.kafkaConnectionId
      }
    },
    {immediate: true},
)

watch(
    () => sourceForm.value.sourceConnectionId,
    async (connectionId, previousConnectionId) => {
      if (props.presetSource) return
      if (connectionId === previousConnectionId) return
      sourceForm.value.sourceDatabase = ''
      sourceForm.value.tableName = ''
      availableTables.value = []
      tablesLoadError.value = false
      tablesResolved.value = false
      if (!topicManual.value) {
        form.value.topic = ''
      }
      if (!connectionId) {
        databasesLoading.value = false
        return
      }
      databasesLoading.value = true
      try {
        await explorer.ensureChildrenLoaded(connectionId)
      } catch {
        // ignore
      } finally {
        databasesLoading.value = false
      }
    },
)

watch(
    () => [sourceForm.value.sourceConnectionId, sourceForm.value.sourceDatabase] as const,
    async ([connectionId, database], previous) => {
      if (props.presetSource) return
      const [prevConnectionId, prevDatabase] = previous ?? ['', '']
      if (connectionId === prevConnectionId && database === prevDatabase) return
      sourceForm.value.tableName = ''
      availableTables.value = []
      tablesLoadError.value = false
      tablesResolved.value = false
      if (!topicManual.value) {
        form.value.topic = ''
      }
      if (!needsSourceSelection.value || !connectionId || !database.trim()) return
      const connection = sourceConnections.value.find((item) => item.id === connectionId)
      if (!connection) return
      tablesLoading.value = true
      try {
        availableTables.value = await fetchTablesForScope(
            explorer.tree,
            {
              connectionId,
              database: database.trim(),
              connectionLabel: connection.label,
              dbType: connection.dbType,
            },
            {ensureChildrenLoaded: (nodeId) => explorer.ensureChildrenLoaded(nodeId)},
        )
      } catch {
        tablesLoadError.value = true
        availableTables.value = []
      } finally {
        tablesLoading.value = false
        tablesResolved.value = true
      }
    },
)

watch(
    () => sourceForm.value.tableName,
    (tableName) => {
      if (props.presetSource) return
      applyTopicForTable(tableName)
    },
)

watch(
    [form, sourceForm],
    () => {
      if (publishing.value) return
      submitError.value = null
      submitResult.value = null
    },
    {deep: true},
)

watch(
    () =>
        [
          sourceLabel.value,
          sourceDetail.value,
          optionsLabel.value,
          optionsDetail.value,
          kafkaLabel.value,
          form.value.topic,
          selectedNodeId.value,
          statuses.value.source,
          statuses.value.options,
          statuses.value.kafka,
          Object.entries(positionOverrides.value)
              .map(([id, pos]) => `${id}:${pos.x},${pos.y}`)
              .join(';'),
        ] as const,
    () => {
      const layout = layoutKafkaPublishCanvas({
        sourceLabel: sourceLabel.value,
        sourceDetail: sourceDetail.value,
        optionsLabel: optionsLabel.value,
        optionsDetail: optionsDetail.value,
        kafkaLabel: kafkaLabel.value,
        topic: form.value.topic,
        labels: {
          sourceBadge: t('explorer.kafkaTablePublish.pipelineSource'),
          optionsBadge: t('explorer.kafkaTablePublish.readinessParams'),
          kafkaBadge: t('explorer.kafkaTablePublish.pipelineKafka'),
          sourceEmpty: t('explorer.kafkaTablePublish.pipelinePendingSource'),
          optionsEmpty: t('explorer.kafkaTablePublish.advancedOptionsTitle'),
          kafkaEmpty: t('explorer.kafkaTablePublish.pipelinePendingKafka'),
          topicEmpty: t('explorer.kafkaTablePublish.pipelinePendingTopic'),
          edgeRead: t('explorer.kafkaTablePublish.canvasEdgeRead'),
          edgePublish: t('explorer.kafkaTablePublish.canvasEdgePublish'),
        },
        statuses: statuses.value,
        positionOverrides: positionOverrides.value,
      })

      const statusLabels: Record<string, string> = {
        ready: t('explorer.kafkaTablePublish.canvasStatusReady'),
        incomplete: t('explorer.kafkaTablePublish.canvasStatusIncomplete'),
        idle: t('explorer.kafkaTablePublish.canvasStatusIdle'),
      }

      flowNodes.value = layout.nodes.map((node) => ({
        id: node.id,
        type: 'kafkaPublish',
        position: {x: node.x, y: node.y},
        style: {width: `${node.width}px`, height: `${node.height}px`},
        data: {
          kind: node.kind,
          title: node.title,
          subtitle: node.subtitle,
          badge: node.badge,
          status: node.status,
          statusLabel: statusLabels[node.status] ?? node.status,
          selected: node.id === selectedNodeId.value,
        },
        draggable: !publishing.value,
      }))

      flowEdges.value = layout.edges.map((edge) => ({
        id: edge.id,
        source: edge.fromId,
        target: edge.toId,
        sourceHandle: 'out',
        targetHandle: 'in',
        label: edge.label || undefined,
        type: 'smoothstep',
        animated: Boolean(edge.animated),
      }))
    },
    {immediate: true},
)

const sendConfirmMessage = computed(() => (
    t('explorer.kafkaTablePublish.sendRulesConfirmBody', {batch: form.value.maxMessages})
))

function requestStop() {
  stopRequested.value = true
}

async function submit() {
  const context = resolvedContext.value
  if (!context || validationError.value || publishing.value) return

  submitAttempted.value = true
  touched.value = {
    sourceConnectionId: true,
    sourceDatabase: true,
    tableName: true,
    kafkaConnectionId: true,
    topic: true,
  }
  if (validationError.value) {
    selectedNodeId.value = nextIncompleteKafkaPublishNode(statuses.value, selectedNodeId.value)
    return
  }

  if (form.value.continuous) {
    sendConfirmOpen.value = true
    return
  }

  await runPublish()
}

async function onSendConfirm() {
  sendConfirmOpen.value = false
  await runPublish()
}

async function runPublish() {
  const context = resolvedContext.value
  if (!context || publishing.value) return

  publishing.value = true
  stopRequested.value = false
  submitError.value = null
  submitResult.value = null
  liveSent.value = 0
  liveFailed.value = 0
  datagenSeed.value = Date.now()
  datagenRowOffset.value = 0

  const batchResults: PublishTableToKafkaResult[] = []

  try {
    do {
      const result = await explorerApi.publishTableToKafka(
          form.value.kafkaConnectionId,
          buildPublishTableToKafkaRequest(context, form.value, {
            datagenSeed: datagenSeed.value,
            datagenRowOffset: datagenRowOffset.value,
          }),
          {silent: true},
      )
      batchResults.push(result)
      liveSent.value += result.messagesSent
      liveFailed.value += result.messagesFailed

      if (form.value.dataSource === 'fake') {
        datagenRowOffset.value += result.messagesSent
      }

      if (result.messagesFailed > 0 || result.stopReason === 'PRODUCE_ERROR') {
        submitError.value = result.lastError
            ?? t('explorer.kafkaTablePublish.partialFailed', {
              sent: liveSent.value,
              failed: liveFailed.value,
            })
        break
      }

      if (!form.value.continuous) {
        submitResult.value = result
        break
      }

      if (stopRequested.value) {
        submitResult.value = aggregatePublishResults(batchResults, true)
        break
      }
    } while (form.value.continuous)

    if (!submitError.value && form.value.continuous && batchResults.length > 0 && !submitResult.value) {
      submitResult.value = aggregatePublishResults(batchResults, stopRequested.value)
    }
  } catch (error) {
    submitError.value = resolveKafkaTablePublishErrorMessage(error, t)
  } finally {
    publishing.value = false
    stopRequested.value = false
  }
}

defineExpose({resetFormState})
</script>

<template>
  <form
      class="migration-canvas migration-flow-panel migration-flow-panel--canvas kafka-publish-canvas"
      :class="{ 'is-publishing': publishing }"
      @submit.prevent="submit"
  >
    <div class="migration-canvas__toolbar">
      <div class="migration-canvas__checklist">
        <span class="migration-canvas__ready">
          {{ t('explorer.kafkaTablePublish.canvasReadyCount', {ready: readyCount, total: 3}) }}
        </span>
        <p class="migration-canvas__hint">{{ checklistHint }}</p>
      </div>
      <div class="migration-canvas__toolbar-actions">
        <button
            v-if="readyCount < 3"
            type="button"
            class="migration-canvas__link"
            :disabled="publishing"
            @click="goToIncomplete"
        >
          {{ t('explorer.kafkaTablePublish.canvasGoIncomplete') }}
        </button>
        <button
            v-if="Object.keys(positionOverrides).length"
            type="button"
            class="migration-canvas__link"
            :disabled="publishing"
            @click="resetLayout"
        >
          {{ t('explorer.kafkaTablePublish.canvasResetLayout') }}
        </button>
      </div>
    </div>

    <div class="migration-canvas__body" :class="{ 'migration-canvas__body--solo': !showPalette }">
      <aside v-if="showPalette" class="migration-canvas__palette">
        <header class="migration-canvas__palette-head">
          <strong>{{ t('explorer.kafkaTablePublish.canvasPalette') }}</strong>
          <DwInput
              v-model="tableFilter"
              type="search"
              variant="sm"
              :placeholder="t('explorer.kafkaTablePublish.canvasPaletteFilter')"
              :disabled="publishing || tablesLoading"
          />
        </header>
        <ul class="migration-canvas__palette-list">
          <li v-if="tablesLoading" class="migration-canvas__palette-empty">
            {{ t('explorer.kafkaTablePublish.loadingTables') }}
          </li>
          <li v-else-if="tablesLoadError" class="migration-canvas__palette-empty">
            <DwInlineAlert :message="t('explorer.kafkaTablePublish.loadTablesFailed')"/>
          </li>
          <li v-else-if="!filteredTables.length" class="migration-canvas__palette-empty">
            {{ t('explorer.kafkaTablePublish.canvasPaletteEmpty') }}
          </li>
          <li v-for="name in filteredTables" :key="name">
            <button
                type="button"
                class="migration-canvas__palette-item"
                :class="{ 'is-selected': sourceForm.tableName === name }"
                :disabled="publishing"
                @click="pickTable(name)"
            >
              <span>{{ name }}</span>
            </button>
          </li>
        </ul>
        <p class="migration-canvas__hint">{{ t('explorer.kafkaTablePublish.canvasPaletteHint') }}</p>
      </aside>

      <div class="migration-canvas__main">
        <div class="migration-canvas__stage">
          <DwGraphCanvas
              v-model:nodes="flowNodes"
              v-model:edges="flowEdges"
              :node-types="nodeTypes"
              :fit-view-on-init="true"
              :fit-view-max-zoom="1"
              :min-zoom="0.45"
              :max-zoom="1.6"
              :nodes-draggable="!publishing"
              @node-click="onNodeClick"
              @node-drag-stop="onNodeDragStop"
          />
        </div>

        <aside class="migration-canvas__inspector">
          <header class="migration-canvas__inspector-head">
            <strong>{{ inspectorTitle }}</strong>
            <nav class="migration-canvas__node-tabs kafka-publish-canvas__tabs" :aria-label="t('explorer.kafkaTablePublish.canvasNodeTabs')">
              <button
                  v-for="kind in (['source', 'options', 'kafka'] as const)"
                  :key="kind"
                  type="button"
                  class="migration-canvas__node-tab"
                  :class="{
                    'is-active': selectedNodeId === kind,
                    'is-incomplete': statuses[kind] === 'incomplete',
                  }"
                  :disabled="publishing"
                  @click="selectNode(kind)"
              >
                {{ t(`explorer.kafkaTablePublish.canvasTab.${kind}`) }}
              </button>
            </nav>
          </header>

          <div v-if="selectedNodeId === 'source'" class="migration-canvas__inspector-body">
            <template v-if="presetSource && !needsSourceSelection">
              <dl class="migration-canvas__kv">
                <div>
                  <dt>{{ t('explorer.kafkaTablePublish.sourceConnection') }}</dt>
                  <dd>{{ presetSource.sourceConnectionLabel }}</dd>
                </div>
                <div>
                  <dt>{{ t('explorer.kafkaTablePublish.sourceDatabase') }}</dt>
                  <dd>{{ presetSource.sourceDatabase }}</dd>
                </div>
                <div>
                  <dt>{{ t('explorer.kafkaTablePublish.sourceTable') }}</dt>
                  <dd>{{ presetSource.tableName }}</dd>
                </div>
              </dl>
              <p class="migration-canvas__hint">{{ t('explorer.kafkaTablePublish.canvasSourceLockedHint') }}</p>
            </template>
            <template v-else>
              <label class="kafka-publish-field">
                <span>{{ t('explorer.kafkaTablePublish.sourceConnection') }}</span>
                <DwSelect
                    v-model="sourceForm.sourceConnectionId"
                    :placeholder="t('explorer.kafkaTablePublish.pickSourceConnection')"
                    :options="sourceConnectionOptions"
                    :disabled="fieldDisabled"
                    @update:model-value="touchField('sourceConnectionId')"
                />
                <DwInlineAlert :message="sourceConnectionError"/>
              </label>
              <label class="kafka-publish-field">
                <span>{{ t('explorer.kafkaTablePublish.sourceDatabase') }}</span>
                <DwSelect
                    v-model="sourceForm.sourceDatabase"
                    :placeholder="databasesLoading
                        ? t('explorer.kafkaTablePublish.loadingDatabases')
                        : t('explorer.kafkaTablePublish.pickSourceDatabase')"
                    :options="sourceDatabaseOptions"
                    :disabled="fieldDisabled || !sourceForm.sourceConnectionId || databasesLoading"
                    @update:model-value="touchField('sourceDatabase')"
                />
                <DwInlineAlert :message="sourceDatabaseError"/>
              </label>
              <label class="kafka-publish-field">
                <span>{{ t('explorer.kafkaTablePublish.sourceTable') }}</span>
                <DwSelect
                    v-if="!tablesResolved || sourceTableOptions.length > 0"
                    v-model="sourceForm.tableName"
                    :placeholder="tablesLoading
                        ? t('explorer.kafkaTablePublish.loadingTables')
                        : t('explorer.kafkaTablePublish.pickSourceTable')"
                    :options="sourceTableOptions"
                    :disabled="fieldDisabled || !sourceForm.sourceDatabase || tablesLoading || databasesLoading"
                    @update:model-value="touchField('tableName')"
                />
                <input
                    v-else
                    v-model="sourceForm.tableName"
                    class="kafka-publish-field__input"
                    type="text"
                    spellcheck="false"
                    :disabled="fieldDisabled || !sourceForm.sourceDatabase"
                    @blur="touchField('tableName')"
                    @input="applyTopicForTable(sourceForm.tableName)"
                >
                <DwInlineAlert
                    :message="tablesLoadError ? t('explorer.kafkaTablePublish.loadTablesFailed') : sourceTableError"
                />
              </label>
            </template>
          </div>

          <div v-else-if="selectedNodeId === 'options'" class="migration-canvas__inspector-body">
            <label class="kafka-publish-field">
              <span>{{ t('explorer.kafkaTablePublish.dataSource') }}</span>
              <div class="kafka-publish-field__options">
                <button
                    type="button"
                    class="kafka-publish-field__option"
                    :class="{ 'is-active': form.dataSource === 'table' }"
                    :disabled="fieldDisabled"
                    @click="form.dataSource = 'table'"
                >
                  {{ t('explorer.kafkaTablePublish.dataSourceTable') }}
                </button>
                <button
                    type="button"
                    class="kafka-publish-field__option"
                    :class="{ 'is-active': form.dataSource === 'fake' }"
                    :disabled="fieldDisabled"
                    @click="form.dataSource = 'fake'"
                >
                  {{ t('explorer.kafkaTablePublish.dataSourceFake') }}
                </button>
              </div>
              <span class="kafka-publish-field__hint">{{ form.dataSource === 'fake'
                  ? t('explorer.kafkaTablePublish.dataSourceFakeHint')
                  : t('explorer.kafkaTablePublish.dataSourceTableHint') }}</span>
            </label>

            <label class="kafka-publish-field kafka-publish-field--checkbox">
              <span>{{ t('explorer.kafkaTablePublish.sendMode') }}</span>
              <DwCheckbox
                  v-model="form.continuous"
                  class="kafka-publish-field__checkbox"
                  :disabled="fieldDisabled"
              >
                {{ t('explorer.kafkaTablePublish.continuousSend') }}
              </DwCheckbox>
              <span class="kafka-publish-field__hint">{{ t('explorer.kafkaTablePublish.continuousSendHint') }}</span>
            </label>

            <div class="kafka-publish-field__row">
              <label class="kafka-publish-field">
                <span>{{ maxMessagesLabel }}</span>
                <input
                    v-model.number="form.maxMessages"
                    class="kafka-publish-field__input"
                    type="number"
                    min="1"
                    :max="KAFKA_PUBLISH_MAX_MESSAGES_CAP"
                    :disabled="fieldDisabled"
                >
                <span class="kafka-publish-field__hint">{{ maxMessagesHint }}</span>
              </label>
              <label class="kafka-publish-field">
                <span>{{ t('explorer.kafkaTablePublish.intervalMs') }}</span>
                <input
                    v-model.number="form.intervalMs"
                    class="kafka-publish-field__input"
                    type="number"
                    min="0"
                    :max="KAFKA_PUBLISH_MAX_INTERVAL_MS"
                    :disabled="fieldDisabled"
                >
              </label>
              <label class="kafka-publish-field">
                <span>{{ t('explorer.kafkaTablePublish.partition') }}</span>
                <input
                    v-model="form.partition"
                    class="kafka-publish-field__input"
                    type="text"
                    inputmode="numeric"
                    :placeholder="t('explorer.kafkaTablePublish.partitionOptional')"
                    :disabled="fieldDisabled"
                >
              </label>
            </div>

            <label class="kafka-publish-field">
              <span>{{ t('explorer.kafkaTablePublish.keyColumn') }}</span>
              <input
                  v-model="form.keyColumn"
                  class="kafka-publish-field__input"
                  type="text"
                  spellcheck="false"
                  :placeholder="t('explorer.kafkaTablePublish.keyColumnOptional')"
                  :disabled="fieldDisabled"
              >
            </label>

            <section class="kafka-publish-rules" aria-label="send rules">
              <h4>{{ t('explorer.kafkaTablePublish.sendRulesTitle') }}</h4>
              <ul>
                <li v-for="(line, index) in sendRulesLines" :key="index">{{ line }}</li>
              </ul>
            </section>
          </div>

          <div v-else class="migration-canvas__inspector-body">
            <label class="kafka-publish-field">
              <span>{{ t('explorer.kafkaTablePublish.kafkaConnection') }}</span>
              <DwSelect
                  v-model="form.kafkaConnectionId"
                  :placeholder="t('explorer.kafkaTablePublish.noKafkaConnections')"
                  :options="kafkaConnectionOptions"
                  :disabled="fieldDisabled || lockKafkaConnection || !kafkaConnectionOptions.length"
                  @update:model-value="touchField('kafkaConnectionId')"
              />
              <DwInlineAlert :message="kafkaConnectionError"/>
            </label>
            <label class="kafka-publish-field">
              <span>{{ t('explorer.kafkaTablePublish.topic') }}</span>
              <input
                  v-model="form.topic"
                  class="kafka-publish-field__input"
                  type="text"
                  spellcheck="false"
                  :placeholder="t('explorer.kafkaTablePublish.topicPlaceholder')"
                  :disabled="fieldDisabled"
                  @input="onTopicInput"
              >
              <DwInlineAlert :message="topicError"/>
            </label>
            <p class="migration-canvas__hint">{{ t('explorer.kafkaTablePublish.canvasTargetHint') }}</p>
          </div>
        </aside>
      </div>
    </div>

    <footer class="kafka-publish-canvas__footer">
      <DwInlineAlert
          class="kafka-publish-canvas__feedback"
          :variant="footerMessage.tone === 'error'
              ? 'error'
              : footerMessage.tone === 'success'
                  ? 'success'
                  : 'info'"
          :message="footerMessage.text"
      />
      <div class="kafka-publish-canvas__actions">
        <DwButton
            v-if="successMessage && !isContinuousRunning && !publishing"
            variant="secondary"
            size="sm"
            type="button"
            @click="resetFormState"
        >
          {{ t('explorer.kafkaTablePublish.publishAgain') }}
        </DwButton>
        <DwButton
            v-if="isContinuousRunning"
            variant="secondary"
            size="sm"
            type="button"
            @click="requestStop"
        >
          {{ t('explorer.kafkaTablePublish.stop') }}
        </DwButton>
        <DwButton
            v-if="!isContinuousRunning"
            variant="primary"
            size="sm"
            type="submit"
            :disabled="!canPublish"
        >
          {{ publishing ? t('explorer.kafkaTablePublish.publishing') : t('explorer.kafkaTablePublish.publish') }}
        </DwButton>
      </div>
    </footer>
  </form>

  <ConfirmDialog
      v-model:open="sendConfirmOpen"
      :title="t('explorer.kafkaTablePublish.sendRulesConfirmTitle')"
      :message="sendConfirmMessage"
      :confirm-label="t('explorer.kafkaTablePublish.publish')"
      @confirm="onSendConfirm"
  />
</template>

<style scoped>
.kafka-publish-canvas {
  min-height: 0;
  height: 100%;
}

.kafka-publish-canvas :deep(.migration-canvas__body--solo) {
  grid-template-columns: minmax(0, 1fr);
}

.kafka-publish-canvas :deep(.migration-canvas__palette-item) {
  width: 100%;
  text-align: left;
}

.kafka-publish-canvas.is-publishing .migration-canvas__stage {
  pointer-events: none;
  opacity: 0.85;
}

.kafka-publish-canvas__tabs {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.kafka-publish-field {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  font-size: var(--dw-text-sm);
}

.kafka-publish-field > span:first-child {
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.kafka-publish-field__input {
  width: 100%;
  height: var(--dw-control-h-sm);
  min-height: var(--dw-control-h-sm);
  max-height: var(--dw-control-h-sm);
  box-sizing: border-box;
  padding: 0 var(--dw-space-3);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  color: var(--dw-text);
  font: inherit;
  font-size: var(--dw-font-size-control);
}

.kafka-publish-field__input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.kafka-publish-field__options {
  display: flex;
  gap: var(--dw-gap-sm);
}

.kafka-publish-field__option {
  flex: 1;
  height: var(--dw-control-h-sm);
  min-height: var(--dw-control-h-sm);
  box-sizing: border-box;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  color: var(--dw-text-secondary);
  font: inherit;
  font-size: var(--dw-font-size-control);
  cursor: pointer;
}

.kafka-publish-field__option.is-active {
  border-color: color-mix(in srgb, var(--dw-primary) 45%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg));
  color: var(--dw-text);
  font-weight: 600;
}

.kafka-publish-field__option:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.kafka-publish-field__checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
}

.kafka-publish-field__hint {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.kafka-publish-field__row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dw-space-4);
}

.kafka-publish-rules {
  margin-top: var(--dw-space-2);
  padding: var(--dw-pad-control);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-bg-editor) 55%, var(--dw-bg-panel));
}

.kafka-publish-rules h4 {
  margin: 0 0 var(--dw-space-2);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.kafka-publish-rules ul {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: 1.5;
}

.kafka-publish-canvas__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  flex-shrink: 0;
  margin-top: var(--dw-space-4);
  padding-top: var(--dw-space-4);
  border-top: 1px solid var(--dw-border-light);
}

.kafka-publish-canvas__feedback {
  flex: 1;
  min-width: 0;
}

.kafka-publish-canvas__actions {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .kafka-publish-field__row {
    grid-template-columns: 1fr;
  }

  .kafka-publish-canvas__footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
