<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, DwOverlayScroll, EmptyState} from '@/core/components'
import {packsApi} from '@/api/modules/packs'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import type {PackAuditEventDto} from '@/shared/api/types'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const {t} = useI18n()
const entitlement = useEntitlementStore()
const loading = ref(false)
const error = ref<string | null>(null)
const events = ref<PackAuditEventDto[]>([])

const heartbeatHint = computed(() => {
    if (!entitlement.heartbeatConfigured) {
        return t('pack.audit.heartbeatOff')
    }
    if (entitlement.heartbeatAt) {
        return t('pack.audit.heartbeatAt', {at: entitlement.heartbeatAt})
    }
    return t('pack.audit.heartbeatPending')
})

async function refresh() {
    loading.value = true
    error.value = null
    try {
        events.value = await packsApi.fetchAudit(80)
        await entitlement.refresh()
    } catch (err) {
        error.value = resolveCaughtApiErrorMessage(err, t, 'pack.audit.loadFailed')
        events.value = []
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    void refresh()
})
</script>

<template>
  <section class="pack-audit" aria-labelledby="pack-audit-title">
    <div class="pack-audit__head">
      <div>
        <h2 id="pack-audit-title" class="pack-audit__title">{{ t('pack.audit.title') }}</h2>
        <p class="pack-audit__sub">{{ t('pack.audit.subtitle') }}</p>
        <p class="pack-audit__heartbeat" data-testid="pack-audit-heartbeat">{{ heartbeatHint }}</p>
      </div>
      <DwButton variant="secondary" size="sm" type="button" :loading="loading" @click="refresh">
        {{ t('pack.audit.refresh') }}
      </DwButton>
    </div>

    <DwInlineAlert v-if="error" variant="error" :message="error"/>
    <EmptyState v-else-if="!loading && !events.length" :title="t('pack.audit.empty')"/>
    <DwOverlayScroll v-else class="pack-audit__list">
      <ul class="pack-audit__rows">
        <li v-for="(event, index) in events" :key="event.id ?? `audit-${index}`" class="pack-audit__row">
          <div class="pack-audit__meta">
            <span class="pack-audit__action">{{ event.action }}</span>
            <span v-if="event.packId" class="pack-audit__pack">{{ event.packId }}</span>
          </div>
          <p v-if="event.detail" class="pack-audit__detail">{{ event.detail }}</p>
          <p class="pack-audit__foot">
            <span>{{ event.at }}</span>
            <span v-if="event.actor">{{ event.actor }}</span>
          </p>
        </li>
      </ul>
    </DwOverlayScroll>
  </section>
</template>

<style scoped>
.pack-audit {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
  margin-top: var(--dw-space-6);
  padding-top: var(--dw-space-4);
  border-top: 1px solid var(--dw-border-subtle);
}

.pack-audit__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.pack-audit__title {
  margin: 0;
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.pack-audit__sub {
  margin: var(--dw-space-1) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.pack-audit__heartbeat {
  margin: var(--dw-space-1) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

/* 嵌套在 module-shell__main 内时全局 attach 会跳过；显式用 DwOverlayScroll */
.pack-audit :deep(.dw-overlay-scroll) {
  max-height: 18rem;
  min-height: 0;
}

.pack-audit__rows {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pack-audit__row {
  padding: var(--dw-space-2) var(--dw-space-3);
  border: 1px solid var(--dw-border-subtle);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-elevated, var(--dw-bg-panel));
}

.pack-audit__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2);
  font-size: var(--dw-text-sm);
}

.pack-audit__action {
  font-weight: 600;
}

.pack-audit__pack {
  color: var(--dw-text-muted);
  font-family: var(--dw-font-mono, monospace);
}

.pack-audit__detail {
  margin: var(--dw-space-1) 0 0;
  font-size: var(--dw-text-sm);
}

.pack-audit__foot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-3);
  margin: var(--dw-space-1) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}
</style>
