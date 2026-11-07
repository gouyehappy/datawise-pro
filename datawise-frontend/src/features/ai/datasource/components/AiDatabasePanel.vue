<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {SearchInput, SidePanel} from '@/core/components'
import IconButton from '@/core/components/IconButton.vue'
import {DwIcon} from '@/core/icons'
import AiTaggedScopeTree from '@/features/ai/datasource/components/AiTaggedScopeTree.vue'
import AiTargetSchemaPreview from '@/features/ai/datasource/components/AiTargetSchemaPreview.vue'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'

const props = withDefaults(
    defineProps<{
      border?: 'left' | 'right' | 'none'
      embedded?: boolean
      selectedTargets?: AiDatabaseTarget[]
    }>(),
    {border: 'left', embedded: false, selectedTargets: () => []},
)

const selectedIds = defineModel<string[]>('selectedIds', {required: true})

const {t} = useI18n()
const search = ref('')
const treeRef = ref<InstanceType<typeof AiTaggedScopeTree>>()

const allVisibleSelected = computed(() => treeRef.value?.allVisibleSelected ?? false)

function toggleAllVisible() {
    if (allVisibleSelected.value) treeRef.value?.clearVisible()
    else treeRef.value?.selectAllVisible()
}

function refreshCatalog() {
    treeRef.value?.reload()
}
</script>

<template>
  <SidePanel
      class="ai-datasource-panel"
      :title="embedded ? '' : t('ai.databasePanel.title')"
      :subtitle="embedded ? undefined : t('ai.databasePanel.subtitle')"
      :border="props.border"
  >
    <template v-if="!embedded" #badge>
      <span v-if="selectedIds.length" class="dw-badge">{{ selectedIds.length }}</span>
    </template>

    <template #toolbar>
      <div class="scope-toolbar">
        <SearchInput
            v-model="search"
            class="scope-toolbar__search"
            :placeholder="t('ai.databasePanel.search')"
        />
        <div class="scope-toolbar__actions">
          <IconButton
              :title="allVisibleSelected ? t('ai.databasePanel.clearVisible') : t('ai.databasePanel.selectVisible')"
              @click="toggleAllVisible"
          >
            <DwIcon
                :name="allVisibleSelected ? 'minus' : 'submit'"
                size="sm"
                :stroke-width="1.5"
            />
          </IconButton>
          <IconButton :title="t('ai.databasePanel.refresh')" @click="refreshCatalog">
            <DwIcon name="refresh" size="sm" :stroke-width="1.35"/>
          </IconButton>
          <button
              v-if="selectedIds.length"
              class="scope-toolbar__clear"
              type="button"
              @click="selectedIds = []"
          >
            {{ t('ai.databasePanel.clearAll') }}
          </button>
        </div>
      </div>
    </template>

    <AiTaggedScopeTree
        ref="treeRef"
        v-model:selected-ids="selectedIds"
        v-model:search="search"
    />
    <AiTargetSchemaPreview
        v-if="!embedded && props.selectedTargets.length"
        :targets="props.selectedTargets"
    />
  </SidePanel>
</template>

<style scoped>
.ai-datasource-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ai-datasource-panel :deep(.dw-side-panel__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.ai-datasource-panel :deep(.dw-side-panel__toolbar) {
  padding: var(--dw-space-4) var(--dw-space-5) var(--dw-space-3);
}

.scope-toolbar {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
}

.scope-toolbar__search {
  flex: 1;
  min-width: 0;
}

.scope-toolbar__search :deep(input) {
  min-height: var(--dw-control-h-sm);
  padding-top: 5px;
  padding-bottom: 5px;
  font-size: var(--dw-text-sm);
  border-radius: var(--dw-control-radius);
}

.scope-toolbar__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-1);
  flex-shrink: 0;
}

.scope-toolbar__actions :deep(.dw-icon-btn) {
  width: 28px;
  height: var(--dw-btn-height);
  border-radius: var(--dw-control-radius);
  color: var(--dw-text-muted);
}

.scope-toolbar__actions :deep(.dw-icon-btn:hover:not(:disabled)) {
  color: var(--dw-primary);
  background: var(--dw-primary-soft);
}

.scope-toolbar__clear {
  margin-left: var(--dw-space-1);
  padding: 0 var(--dw-space-4);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-btn-height);
  cursor: pointer;
  white-space: nowrap;
}

.scope-toolbar__clear:hover {
  color: var(--dw-danger);
  background: color-mix(in srgb, var(--dw-danger) 8%, transparent);
}
</style>
