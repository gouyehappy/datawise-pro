<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, ModalActions, DwInlineAlert} from '@/core/components'
import type {ThirdPartyImportParseResult} from '@/features/explorer/services/third-party-connection-import'

const props = defineProps<{
    open: boolean
    fileName: string
    parse: ThirdPartyImportParseResult | null
    busy?: boolean
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    confirm: []
}>()

const {t} = useI18n()

const sourceLabel = computed(() => {
    const source = props.parse?.source
    if (source === 'datagrip') return t('explorer.thirdPartyImport.sourceDatagrip')
    if (source === 'dbeaver') return t('explorer.thirdPartyImport.sourceDbeaver')
    if (source === 'navicat') return t('explorer.thirdPartyImport.sourceNavicat')
    return ''
})

const drafts = computed(() => props.parse?.drafts ?? [])
const skipped = computed(() => props.parse?.skipped ?? [])
const canSubmit = computed(() => !props.busy && drafts.value.length > 0)

function close() {
    if (props.busy) return
    emit('update:open', false)
}

function submit() {
    if (!canSubmit.value) return
    emit('confirm')
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('explorer.thirdPartyImport.title')"
      :subtitle="t('explorer.thirdPartyImport.subtitle', {name: fileName, source: sourceLabel})"
      width="640px"
      @close="close"
  >
    <div class="tp-import">
      <DwInlineAlert
          density="banner"
          variant="info"
          :message="t('explorer.thirdPartyImport.passwordHint')"
      />
      <p v-if="drafts.length" class="tp-import__count">
        {{ t('explorer.thirdPartyImport.readyCount', {count: drafts.length}) }}
      </p>
      <div v-if="drafts.length" class="tp-import__list" role="list">
        <div
            v-for="row in drafts"
            :key="row.key"
            class="tp-import__row"
            role="listitem"
        >
          <div class="tp-import__name">{{ row.name }}</div>
          <div class="tp-import__meta">
            <span>{{ row.dbType }}</span>
            <span>{{ row.host }}{{ row.port ? `:${row.port}` : '' }}</span>
            <span v-if="row.user">{{ row.user }}</span>
            <span v-if="row.passwordOmitted" class="tp-import__warn">
              {{ t('explorer.thirdPartyImport.passwordOmitted') }}
            </span>
          </div>
        </div>
      </div>
      <DwInlineAlert
          v-if="!drafts.length"
          density="banner"
          variant="warning"
          :message="t('explorer.thirdPartyImport.empty')"
      />
      <details v-if="skipped.length" class="tp-import__skipped">
        <summary>
          {{ t('explorer.thirdPartyImport.skippedCount', {count: skipped.length}) }}
        </summary>
        <ul>
          <li v-for="(item, idx) in skipped" :key="`${item.name}-${idx}`">
            {{ item.name || '—' }} — {{ item.reason }}
          </li>
        </ul>
      </details>
    </div>

    <template #footer>
      <ModalActions
          :confirm-label="t('explorer.importConnections')"
          :confirm-disabled="!canSubmit"
          :confirm-loading="busy"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.tp-import {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.tp-import__count {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--color-text-secondary);
}

.tp-import__list {
  max-height: 280px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--dw-radius-sm);
}

.tp-import__row {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
}

.tp-import__row:last-child {
  border-bottom: none;
}

.tp-import__name {
  font-weight: 600;
}

.tp-import__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 4px;
  font-size: var(--dw-text-sm);
  color: var(--color-text-secondary);
}

.tp-import__warn {
  color: var(--color-warning, #b45309);
}

.tp-import__skipped {
  font-size: var(--dw-text-sm);
  color: var(--color-text-secondary);
}

.tp-import__skipped ul {
  margin: 6px 0 0;
  padding-left: 1.2em;
}
</style>
