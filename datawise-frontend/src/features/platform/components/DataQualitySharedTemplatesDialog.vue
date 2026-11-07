<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {platformApi} from '@/api'
import {AppModal, ConfirmDialog, DwButton, EmptyState} from '@/core/components'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {formatDataQualitySharedTemplateSummary} from '@/features/platform/services/data-quality-shared-template.service'
import type {DataQualitySharedTemplate} from '@/features/platform/types/platform.types'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    open: boolean
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    deleted: []
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const loading = ref(false)
const deleting = ref(false)
const templates = ref<DataQualitySharedTemplate[]>([])
const deleteConfirmOpen = ref(false)
const pendingDelete = ref<DataQualitySharedTemplate | null>(null)

const sortedTemplates = computed(() =>
    [...templates.value].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'})),
)

const deleteConfirmMessage = computed(() => {
    const item = pendingDelete.value
    if (!item) return ''
    return t('platform.dq.sharedTemplatesDeleteConfirm', {name: item.name})
})

async function reload() {
    loading.value = true
    try {
        templates.value = await platformApi.listDataQualityTemplates()
    } catch {
        templates.value = []
    } finally {
        loading.value = false
    }
}

watch(
    () => props.open,
    (open) => {
        if (!open) {
            pendingDelete.value = null
            deleteConfirmOpen.value = false
            return
        }
        void reload()
    },
    {immediate: true},
)

function close() {
    emit('update:open', false)
}

function requestDelete(item: DataQualitySharedTemplate) {
    pendingDelete.value = item
    deleteConfirmOpen.value = true
}

async function confirmDelete() {
    const item = pendingDelete.value
    if (!item || deleting.value) return
    deleting.value = true
    try {
        await platformApi.deleteDataQualityTemplate(item.id)
        emit('deleted')
        await reload()
    } catch (err) {
        layout.showErrorToast(
            resolveCaughtApiErrorMessage(err, t, 'workspace.platformCatalog.form.dqTemplate.sharedSaveFailed'),
        )
    } finally {
        deleting.value = false
        deleteConfirmOpen.value = false
        pendingDelete.value = null
    }
}

function summary(item: DataQualitySharedTemplate): string {
    return formatDataQualitySharedTemplateSummary(item, t)
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('platform.dq.sharedTemplatesTitle')"
      width="560px"
      @close="close"
  >
    <p class="dq-shared-templates__hint">{{ t('platform.dq.sharedTemplatesHint') }}</p>
    <p v-if="loading" class="dq-shared-templates__status">{{ t('platform.dq.sharedTemplatesLoading') }}</p>
    <EmptyState
        v-else-if="!sortedTemplates.length"
        embedded
        compact
        :title="t('platform.dq.sharedTemplatesEmpty')"
    />
    <ul v-else class="dq-shared-templates__list">
      <li v-for="item in sortedTemplates" :key="item.id" class="dq-shared-templates__row">
        <div class="dq-shared-templates__main">
          <strong class="dq-shared-templates__name">{{ item.name }}</strong>
          <span class="dq-shared-templates__summary">{{ summary(item) }}</span>
        </div>
        <DwButton
            variant="ghost"
            class="dq-shared-templates__delete"
            :disabled="deleting"
            @click="requestDelete(item)"
        >
          {{ t('workspace.platformCatalog.delete') }}
        </DwButton>
      </li>
    </ul>

    <template #footer>
      <DwButton variant="secondary" @click="close">
        {{ t('common.close') }}
      </DwButton>
    </template>
  </AppModal>

  <ConfirmDialog
      v-model:open="deleteConfirmOpen"
      :title="t('workspace.platformCatalog.delete')"
      :message="deleteConfirmMessage"
      :confirm-label="t('workspace.platformCatalog.delete')"
      :confirm-loading="deleting"
      confirm-variant="danger"
      @confirm="confirmDelete"
  />
</template>

<style scoped>
.dq-shared-templates__hint,
.dq-shared-templates__status {
    margin: 0 0 var(--dw-space-4);
    font-size: var(--dw-text-md);
    color: var(--dw-text-muted);
}

.dq-shared-templates__list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--dw-gap-sm);
    max-height: 360px;
    overflow: auto;
}

.dq-shared-templates__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--dw-gap-md);
    padding: var(--dw-space-4);
    border: 1px solid var(--dw-border-light);
    border-radius: var(--dw-control-radius-sm);
    background: var(--dw-bg-subtle);
}

.dq-shared-templates__main {
    display: flex;
    flex-direction: column;
    gap: var(--dw-space-1);
    min-width: 0;
}

.dq-shared-templates__name {
    font-size: var(--dw-text-md);
    color: var(--dw-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dq-shared-templates__summary {
    font-size: var(--dw-text-sm);
    color: var(--dw-text-muted);
    font-family: var(--dw-font-mono, monospace);
}

.dq-shared-templates__delete {
    flex-shrink: 0;
}
</style>
