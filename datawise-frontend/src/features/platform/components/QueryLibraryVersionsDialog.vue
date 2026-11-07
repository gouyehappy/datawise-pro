<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {platformApi} from '@/api'
import {AppModal, DwButton, EmptyState, FormField, ModalActions} from '@/core/components'

import type {QueryLibraryVersion} from '@/features/platform/types/platform.types'

const props = defineProps<{
    open: boolean
    teamId: string | null
    queryId: string | null
    queryTitle?: string
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
}>()

const {t} = useI18n()
const loading = ref(false)
const versions = ref<QueryLibraryVersion[]>([])

const sortedVersions = computed(() =>
    [...versions.value].sort((a, b) => b.version - a.version),
)

watch(
    () => [props.open, props.teamId, props.queryId] as const,
    async ([open, teamId, queryId]) => {
        if (!open || !teamId || !queryId) {
            versions.value = []
            return
        }
        loading.value = true
        try {
            versions.value = await platformApi.listQueryLibraryVersions(teamId, queryId)
        } catch {
            versions.value = []
        } finally {
            loading.value = false
        }
    },
    {immediate: true},
)

function close() {
    emit('update:open', false)
}

function formatTime(value?: string | null): string {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('platform.queryLibrary.historyTitle', {name: queryTitle || queryId || ''})"
      width="560px"
      @close="close"
  >
    <p v-if="loading" class="query-library__status">{{ t('platform.common.loading') }}</p>
    <EmptyState
        v-else-if="!sortedVersions.length"
        embedded
        compact
        :title="t('platform.queryLibrary.empty')"
    />
    <ul v-else class="query-library__list">
      <li v-for="item in sortedVersions" :key="item.version" class="query-library__row">
        <div class="query-library__head">
          <strong>v{{ item.version }}</strong>
          <span>{{ formatTime(item.savedAt) }}</span>
        </div>
        <p v-if="item.changeNote" class="query-library__note">{{ item.changeNote }}</p>
        <pre class="query-library__sql">{{ item.sql }}</pre>
      </li>
    </ul>

    <template #footer>
      <DwButton type="button" variant="ghost" @click="close">{{ t('common.close') }}</DwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.query-library__status {
    margin: 0;
    font-size: var(--dw-text-md);
    color: var(--dw-text-muted);
}

.query-library__list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--dw-gap-md);
    max-height: 400px;
    overflow: auto;
}

.query-library__head {
    display: flex;
    justify-content: space-between;
    font-size: var(--dw-text-sm);
    color: var(--dw-text-muted);
}

.query-library__note {
    margin: var(--dw-space-2) 0;
    font-size: var(--dw-text-sm);
}

.query-library__sql {
    margin: 0;
    padding: var(--dw-space-4);
    border-radius: var(--dw-control-radius-sm);
    background: var(--dw-bg-subtle);
    font-size: var(--dw-text-xs);
    white-space: pre-wrap;
    max-height: 120px;
    overflow: auto;
}
</style>
