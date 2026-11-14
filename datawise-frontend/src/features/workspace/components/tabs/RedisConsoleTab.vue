<script setup lang="ts">
defineOptions({name: 'RedisConsoleTab'})

import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import type {WorkspaceTab} from '@/core/types'
import {explorerApi} from '@/api'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {planOpenRedisKey} from '@/features/workspace/services/workspace-stateless-open.service'
import {parseRedisDbIndex} from '@/features/explorer/services/redis-db.service'
import RedisDbSelector from '@/features/workspace/components/redis/RedisDbSelector.vue'
import RedisKeysPanel from '@/features/workspace/components/redis/RedisKeysPanel.vue'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()
const layout = useLayoutStore()

const keysPanelRef = ref<InstanceType<typeof RedisKeysPanel> | null>(null)
const endpointLabel = ref('')

const connectionId = computed(() => props.tab.connectionId ?? '')
const connectionName = computed(() => {
    if (!connectionId.value) return t('explorer.redisConsole.noConnection')
    return explorer.findNode(connectionId.value)?.label ?? connectionId.value
})

const redisDb = computed({
    get: () => parseRedisDbIndex(props.tab.database),
    set: (value: number) => {
        workspace.updateTabContext(props.tab.id, {database: String(value)})
    },
})

const dbBadge = computed(() => `DB ${redisDb.value}`)

async function loadHeader() {
    if (!connectionId.value) {
        endpointLabel.value = ''
        return
    }
    const config = await fetchConnectionConfig(connectionId.value)
    if (!config) {
        endpointLabel.value = connectionName.value
        return
    }
    if (config.url?.trim()) {
        endpointLabel.value = config.url.trim()
        return
    }
    const host = config.host?.trim() || 'localhost'
    const port = config.port?.trim() || '6379'
    endpointLabel.value = `redis://${host}:${port}`
}

async function ensureDefaultDb() {
    if ((props.tab.database != null && props.tab.database !== '') || !connectionId.value) return
    try {
        const config = await explorerApi.fetchConnection(connectionId.value)
        workspace.updateTabContext(props.tab.id, {
            database: String(parseRedisDbIndex(config.database)),
        })
    } catch {
        workspace.updateTabContext(props.tab.id, {database: '0'})
    }
}

function refresh() {
    keysPanelRef.value?.refresh()
}

function onOpenKey(key: string) {
    if (!connectionId.value) return
    workspace.openWithPlan(
        planOpenRedisKey,
        {
            connectionId: connectionId.value,
            key,
            explorerNodeId: `${connectionId.value}:redis:${key}`,
        },
        'redis',
    )
}

function onKeyDeleted() {
}

onMounted(async () => {
    void loadHeader()
    await ensureDefaultDb()
    if (props.tab.params?.redisView === 'command') {
        await nextTick()
        keysPanelRef.value?.focusCommand()
    }
})

watch(connectionId, () => {
    void loadHeader()
    void ensureDefaultDb()
})

watch(
    () => props.tab.params?.redisView,
    async (view) => {
        if (view !== 'command') return
        await nextTick()
        keysPanelRef.value?.focusCommand()
    },
)
</script>

<template>
  <div class="redis-workbench">
    <header class="redis-workbench__head">
      <div class="redis-workbench__identity">
        <DwIcon name="database" size="sm" class="redis-workbench__icon"/>
        <span class="redis-workbench__endpoint" :title="endpointLabel">
          {{ endpointLabel || connectionName }}
        </span>
        <span class="redis-workbench__badge">{{ dbBadge }}</span>
      </div>
      <div class="redis-workbench__actions">
        <RedisDbSelector v-model="redisDb"/>
        <button type="button" class="dw-text-btn" @click="refresh">
          {{ t('explorer.redisWorkbench.refresh') }}
        </button>
      </div>
    </header>

    <div class="redis-workbench__body">
      <RedisKeysPanel
          ref="keysPanelRef"
          class="redis-workbench__panel"
          :connection-id="connectionId"
          :database="redisDb"
          @open-key="onOpenKey"
          @key-deleted="onKeyDeleted"
      />
    </div>
  </div>
</template>

<style scoped>
.redis-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--dw-wb-body-bg, var(--dw-bg-editor));
}

.redis-workbench__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-4);
  flex-shrink: 0;
  min-height: 2.25rem;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--dw-border);
  background: var(--dw-bg-panel);
}

.redis-workbench__identity {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  font-size: var(--dw-text-sm);
}

.redis-workbench__icon {
  flex-shrink: 0;
  color: var(--dw-primary);
}

.redis-workbench__endpoint {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--dw-text);
}

.redis-workbench__badge {
  flex-shrink: 0;
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
}

.redis-workbench__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  flex-shrink: 0;
}

.redis-workbench__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.redis-workbench__panel {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  padding: 0;
}
</style>
