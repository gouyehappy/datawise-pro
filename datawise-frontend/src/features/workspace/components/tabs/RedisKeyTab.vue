<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {WorkspaceTab} from '@/core/types'
import {DwButton, DwInlineAlert, EmptyState, WorkbenchListPage} from '@/core/components'
import {explorerApi} from '@/api'
import {
    formatRedisSize,
    formatRedisTtl,
    type RedisKeyDetail,
} from '@/features/explorer/services/redis-key.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    tab: WorkspaceTab
}>()

const {t} = useI18n()

const loading = ref(false)
const error = ref<string | null>(null)
const detail = ref<RedisKeyDetail | null>(null)

const redisKey = computed(() => props.tab.params?.redisKey ?? '')
const connectionId = computed(() => props.tab.connectionId ?? '')

const ttlLabel = computed(() => {
    if (!detail.value) return '—'
    if (detail.value.ttlSeconds === -1) return t('explorer.redisKey.ttlPersistent')
    if (detail.value.ttlSeconds === -2) return t('explorer.redisKey.ttlMissing')
    return formatRedisTtl(detail.value.ttlSeconds)
})

const sizeLabel = computed(() =>
    detail.value ? formatRedisSize(detail.value.type, detail.value.size) : '—',
)

async function loadDetail() {
    if (!connectionId.value || !redisKey.value) return
    loading.value = true
    error.value = null
    try {
        detail.value = await explorerApi.fetchRedisKey(connectionId.value, redisKey.value)
    } catch (err) {
        detail.value = null
        error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.redisKey.loadFailed')
    } finally {
        loading.value = false
    }
}

watch([connectionId, redisKey], loadDetail, {immediate: true})

onMounted(loadDetail)
</script>

<template>
  <!--
    AURA-X: [Modify] - Redis Key 壳迁 WorkbenchListPage（业务面板未合并）
    Protection: 功能完整性已验证，无简化行为
    人格: [@前端艺术家]
  -->
  <WorkbenchListPage
      content-class="redis-key-tab"
      recipe="wb-single"
      title-class="dw-workbench-page__title--break"
      :title="t('explorer.redisKey.title')"
  >
    <template #title-extra>
      <p class="dw-workbench-page__mono">{{ redisKey }}</p>
    </template>
    <template #actions>
      <DwButton variant="secondary" size="sm" :loading="loading" :disabled="loading" @click="loadDetail">
        {{ loading ? t('explorer.redisKey.loading') : t('explorer.redisKey.refresh') }}
      </DwButton>
    </template>

    <div class="redis-key-tab__body dw-embedded-panel">
      <DwInlineAlert v-if="error" :message="error"/>
      <EmptyState v-else-if="loading && !detail" embedded bordered :title="t('explorer.redisKey.loading')"/>

      <section v-else-if="detail" class="redis-key-tab__meta">
        <div class="redis-key-tab__field">
          <span class="redis-key-tab__label">{{ t('explorer.redisKey.type') }}</span>
          <span class="redis-key-tab__value">{{ detail.type }}</span>
        </div>
        <div class="redis-key-tab__field">
          <span class="redis-key-tab__label">{{ t('explorer.redisKey.ttl') }}</span>
          <span class="redis-key-tab__value">{{ ttlLabel }}</span>
        </div>
        <div class="redis-key-tab__field">
          <span class="redis-key-tab__label">{{ t('explorer.redisKey.size') }}</span>
          <span class="redis-key-tab__value">{{ sizeLabel }}</span>
        </div>
      </section>

      <section v-if="detail" class="redis-key-tab__preview">
        <div class="redis-key-tab__preview-head">
          <h3>{{ t('explorer.redisKey.preview') }}</h3>
          <span v-if="detail.previewTruncated" class="redis-key-tab__truncated">
            {{ t('explorer.redisKey.truncated') }}
          </span>
        </div>
        <pre class="redis-key-tab__code">{{ detail.preview || t('explorer.redisKey.emptyValue') }}</pre>
      </section>
    </div>
  </WorkbenchListPage>
</template>

<style scoped>
.redis-key-tab {
  min-width: 0;
}

.redis-key-tab__body {
  overflow: auto;
}

.redis-key-tab__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--dw-space-6);
}

.redis-key-tab__field {
  padding: var(--dw-space-6) var(--dw-space-7);
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-muted);
}

.redis-key-tab__label {
  display: block;
  margin-bottom: var(--dw-space-2);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-text-secondary);
}

.redis-key-tab__value {
  font-size: var(--dw-text-xl);
  font-weight: 600;
}

.redis-key-tab__preview {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: var(--dw-wb-preview-min-height);
}

.redis-key-tab__preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  margin-bottom: var(--dw-space-4);
}

.redis-key-tab__preview-head h3 {
  margin: 0;
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.redis-key-tab__truncated {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.redis-key-tab__code {
  flex: 1;
  margin: 0;
  padding: var(--dw-space-7) var(--dw-space-8);
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-muted);
  color: var(--dw-text);
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}
</style>
