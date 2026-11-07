<script setup lang="ts">
import {nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwInlineAlert, DwSplitPane, EmptyState} from '@/core/components'
import type {RedisKeyDetail} from '@/features/explorer/services/redis-key.service'
import RedisKeysBrowser from '@/features/workspace/components/redis/RedisKeysBrowser.vue'
import RedisKeyDetailPanel from '@/features/workspace/components/redis/RedisKeyDetailPanel.vue'
import RedisCommandPanel from '@/features/workspace/components/redis/RedisCommandPanel.vue'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
    connectionId: string
    database: number
    seedCommand?: string | null
}>()

const emit = defineEmits<{
    openKey: [key: string]
    keyDeleted: [key: string]
}>()

const {t} = useI18n()
const selectedKey = ref<string | null>(null)
const keyDetail = ref<RedisKeyDetail | null>(null)
const keyDetailLoading = ref(false)
const keyDetailError = ref<string | null>(null)
const keysBrowserRef = ref<InstanceType<typeof RedisKeysBrowser> | null>(null)
const commandPanelRef = ref<InstanceType<typeof RedisCommandPanel> | null>(null)
const localSeed = ref<string | null>(null)

function onSelectKey(key: string) {
    selectedKey.value = key
}

function onKeyDeleted(key: string) {
    if (selectedKey.value === key) {
        selectedKey.value = null
        keyDetail.value = null
    }
    keysBrowserRef.value?.refresh()
    emit('keyDeleted', key)
}

async function onRunCommand(command: string) {
    // Clear first so repeating the same quick action still triggers the seed watch.
    localSeed.value = null
    await nextTick()
    localSeed.value = command
}

function refresh() {
    keysBrowserRef.value?.refresh()
}

function focusCommand() {
    commandPanelRef.value?.focusCommandInput?.()
}

watch(
    () => [props.connectionId, props.database] as const,
    () => {
        selectedKey.value = null
        keyDetail.value = null
        keyDetailError.value = null
        localSeed.value = null
    },
)

watch(
    () => props.seedCommand,
    (command) => {
        if (!command) return
        localSeed.value = command
    },
)

defineExpose({refresh, onKeyDeleted, focusCommand})
</script>

<template>
  <div class="connector-browse-panel connector-workbench-pane">
    <DwInlineAlert v-if="keyDetailError" density="banner" variant="error" :message="keyDetailError"/>

    <DwSplitPane
        class="connector-browse-panel__body connector-browse-panel__body--split"
        storage-key="dw.split.redis-keys"
        :default-width="320"
        :min-width="240"
        :max-width="560"
        :end-min-width="300"
        :stack-below="900"
        start-class="connector-browse-panel__pane"
        end-class="connector-browse-panel__pane connector-browse-panel__pane--flush redis-keys-pane__right"
    >
      <template #start>
        <RedisKeysBrowser
            ref="keysBrowserRef"
            :connection-id="connectionId"
            :database="database"
            :selected-key="selectedKey"
            embedded
            @select="onSelectKey"
            @open="emit('openKey', $event)"
        />
      </template>

      <template #end>
        <div v-if="selectedKey" class="redis-keys-pane__detail-wrap">
          <RedisKeyDetailPanel
              class="redis-keys-pane__detail"
              :connection-id="connectionId"
              :database="database"
              :redis-key="selectedKey"
              v-model:detail="keyDetail"
              v-model:loading="keyDetailLoading"
              v-model:error="keyDetailError"
              @run-command="onRunCommand"
              @open-tab="emit('openKey', $event)"
              @deleted="onKeyDeleted"
          />
        </div>
        <EmptyState
            v-else
            embedded
            compact
            class="redis-keys-pane__empty"
            :title="t('explorer.redisConsole.emptyTitle')"
            :hint="t('explorer.redisConsole.emptyHint')"
        />

        <div class="redis-keys-pane__command">
          <RedisCommandPanel
              ref="commandPanelRef"
              :connection-id="connectionId"
              :database="database"
              :selected-key="selectedKey"
              :selected-key-type="keyDetail?.type ?? null"
              :seed-command="localSeed"
              @key-deleted="onKeyDeleted"
          />
        </div>
      </template>
    </DwSplitPane>
  </div>
</template>

<style scoped>
:deep(.redis-keys-pane__right) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.redis-keys-pane__detail-wrap {
  flex: 0 1 42%;
  min-height: 8rem;
  max-height: 55%;
  overflow: auto;
  border-bottom: 1px solid var(--dw-border);
}

.redis-keys-pane__detail {
  height: 100%;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.redis-keys-pane__empty {
  flex: 0 0 auto;
  padding: var(--dw-wb-pane-pad, 0.75rem 1rem);
  border-bottom: 1px solid var(--dw-border);
  align-items: flex-start;
  text-align: left;
  min-height: 0;
}

.redis-keys-pane__command {
  flex: 1 1 auto;
  min-height: 11rem;
  padding: 0.65rem 0.75rem;
  box-sizing: border-box;
  overflow: hidden;
}
</style>
