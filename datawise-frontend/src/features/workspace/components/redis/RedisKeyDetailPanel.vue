<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {ConfirmDialog, DwInlineAlert} from '@/core/components'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {explorerApi} from '@/api'
import {
    formatRedisSize,
    formatRedisTtl,
    type RedisKeyDetail,
} from '@/features/explorer/services/redis-key.service'
import {
    buildRedisDelCommand,
    buildRedisGetCommand,
    buildRedisTtlCommand,
    buildRedisTypeCommand,
} from '@/features/explorer/services/redis-command-hints.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
    connectionId: string
    redisKey: string
    database?: number
}>()

const emit = defineEmits<{
    runCommand: [command: string]
    openTab: [key: string]
    deleted: [key: string]
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const loading = defineModel<boolean>('loading', {default: false})
const detail = defineModel<RedisKeyDetail | null>('detail', {default: null})
const error = defineModel<string | null>('error', {default: null})
const deleteConfirmOpen = ref(false)

const ttlLabel = computed(() => {
    if (!detail.value) return '—'
    if (detail.value.ttlSeconds === -1) return t('explorer.redisKey.ttlPersistent')
    if (detail.value.ttlSeconds === -2) return t('explorer.redisKey.ttlMissing')
    return formatRedisTtl(detail.value.ttlSeconds)
})

const sizeLabel = computed(() =>
    detail.value ? formatRedisSize(detail.value.type, detail.value.size) : '—',
)

const typeClass = computed(() => {
    const type = detail.value?.type?.toLowerCase() ?? ''
    return type ? `is-${type}` : ''
})

async function loadDetail() {
    if (!props.connectionId || !props.redisKey) return
    loading.value = true
    error.value = null
    try {
        detail.value = await explorerApi.fetchRedisKey(props.connectionId, props.redisKey, {
            database: props.database,
        })
    } catch (err) {
        detail.value = null
        error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.redisKey.loadFailed')
    } finally {
        loading.value = false
    }
}

function onRunGet() {
    emit('runCommand', buildRedisGetCommand(props.redisKey))
}

function onRunTtl() {
    emit('runCommand', buildRedisTtlCommand(props.redisKey))
}

function onRunType() {
    emit('runCommand', buildRedisTypeCommand(props.redisKey))
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text)
        layout.showSuccessToast(t('explorer.redisConsole.copied'))
    } catch {
        // ignore clipboard failures
    }
}

async function onDeleteKey() {
    deleteConfirmOpen.value = true
}

async function confirmDeleteKey() {
    try {
        const result = await explorerApi.executeRedisCommand(
            props.connectionId,
            buildRedisDelCommand(props.redisKey),
            {database: props.database},
        )
        if (!result.success) {
            layout.showErrorToast(result.error ?? result.output)
            return
        }
        deleteConfirmOpen.value = false
        emit('deleted', props.redisKey)
    } catch (err) {
        layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'explorer.redisKey.loadFailed'))
    }
}

watch(
    () => [props.connectionId, props.redisKey, props.database] as const,
    () => {
        void loadDetail()
    },
    {immediate: true},
)
</script>

<template>
  <section class="redis-key-detail-panel">
    <header class="redis-key-detail-panel__head">
      <div class="redis-key-detail-panel__title">
        <div class="redis-key-detail-panel__title-row">
          <h3>{{ t('explorer.redisKey.title') }}</h3>
          <span v-if="detail" class="redis-key-detail-panel__type" :class="typeClass">
            {{ detail.type }}
          </span>
        </div>
        <p class="redis-key-detail-panel__key">{{ redisKey }}</p>
      </div>
      <div class="redis-key-detail-panel__actions">
        <button class="connector-list__refresh" type="button" :disabled="loading" @click="loadDetail">
          {{ loading ? t('explorer.redisKey.loading') : t('explorer.redisKey.refresh') }}
        </button>
        <button class="connector-list__refresh" type="button" @click="copyText(redisKey)">
          {{ t('explorer.redisConsole.copyKey') }}
        </button>
        <button class="connector-list__refresh" type="button" :disabled="!detail" @click="copyText(detail?.preview ?? '')">
          {{ t('explorer.redisConsole.copyValue') }}
        </button>
        <button class="connector-list__refresh" type="button" @click="onRunGet">GET</button>
        <button class="connector-list__refresh" type="button" @click="onRunTtl">TTL</button>
        <button class="connector-list__refresh" type="button" @click="onRunType">TYPE</button>
        <button class="connector-list__refresh" type="button" @click="emit('openTab', redisKey)">
          {{ t('explorer.redisBrowser.openInTab') }}
        </button>
        <button class="connector-list__refresh" type="button" @click="onDeleteKey">
          {{ t('explorer.redisConsole.deleteKey') }}
        </button>
      </div>
    </header>

    <DwInlineAlert v-if="error" :message="error"/>
    <div v-else-if="loading && !detail" class="connector-editor-empty">
      <strong>{{ t('explorer.redisKey.loading') }}</strong>
    </div>

    <div v-else-if="detail" class="redis-key-detail-panel__meta">
      <div class="redis-key-detail-panel__field">
        <span>{{ t('explorer.redisKey.ttl') }}</span>
        <strong>{{ ttlLabel }}</strong>
      </div>
      <div class="redis-key-detail-panel__field">
        <span>{{ t('explorer.redisKey.size') }}</span>
        <strong>{{ sizeLabel }}</strong>
      </div>
    </div>

    <pre v-if="detail" class="redis-key-detail-panel__preview">{{ detail.preview || t('explorer.redisKey.emptyValue') }}</pre>
  </section>
  <ConfirmDialog
      v-model:open="deleteConfirmOpen"
      :title="t('explorer.redisConsole.deleteKey')"
      :message="t('explorer.redisConsole.deleteConfirm', {key: redisKey})"
      :confirm-label="t('explorer.redisConsole.deleteKey')"
      confirm-variant="danger"
      @confirm="confirmDeleteKey"
  />
</template>

<style scoped>
.redis-key-detail-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  padding: 0.75rem;
  box-sizing: border-box;
}

.redis-key-detail-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  flex-shrink: 0;
}

.redis-key-detail-panel__title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.redis-key-detail-panel__head h3 {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.redis-key-detail-panel__type {
  padding: 0.1rem 0.4rem;
  border-radius: var(--dw-radius-pill);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
}

.redis-key-detail-panel__type.is-string {
  background: var(--dw-success-soft);
  color: var(--dw-success-fg);
}

.redis-key-detail-panel__type.is-hash {
  background: color-mix(in srgb, var(--dw-link) 15%, transparent);
  color: var(--dw-link);
}

.redis-key-detail-panel__type.is-list {
  background: color-mix(in srgb, var(--mp-tone-amber) 15%, transparent);
  color: var(--mp-tone-amber);
}

.redis-key-detail-panel__type.is-set,
.redis-key-detail-panel__type.is-zset {
  background: color-mix(in srgb, var(--dw-primary) 15%, transparent);
  color: var(--dw-primary);
}

.redis-key-detail-panel__key {
  margin: 0.25rem 0 0;
  color: var(--dw-text-muted);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  word-break: break-all;
}

.redis-key-detail-panel__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
}

.redis-key-detail-panel__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  margin-top: 0.75rem;
  flex-shrink: 0;
}

.redis-key-detail-panel__field {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.redis-key-detail-panel__field strong {
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
}

.redis-key-detail-panel__preview {
  flex: 1;
  min-height: 0;
  margin: 0.75rem 0 0;
  padding: 0.75rem;
  overflow: auto;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-editor);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
