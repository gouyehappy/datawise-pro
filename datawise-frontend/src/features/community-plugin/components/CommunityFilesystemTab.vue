<script setup lang="ts">
defineOptions({name: 'CommunityFilesystemTab'})
import {onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwSplitPane, EmptyState} from '@/core/components'
import {API_PATHS} from '@/shared/api/http/paths'
import {postJson} from '@/shared/api/http/request'
import type {WorkspaceTab} from '@/core/types'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

const props = defineProps<{
  tab: WorkspaceTab
}>()

const {t} = useI18n()
const workspace = useWorkspaceStore()
const loading = ref(false)
const error = ref('')
const entries = ref<Array<{name: string; uri: string; kind: string; size?: number}>>([])
const preview = ref('')
const selectedUri = ref('')

async function refresh() {
  if (!props.tab.pluginId || !props.tab.pluginFilesystemProviderId) return
  loading.value = true
  error.value = ''
  try {
    const result = await postJson<{entries?: Array<{name: string; uri: string; kind: string; size?: number}>}>(
      API_PATHS.communityPlugins.filesystemList(props.tab.pluginId),
      {
        providerId: props.tab.pluginFilesystemProviderId,
        uri: props.tab.pluginFilesystemRootUri || '',
      },
    )
    entries.value = result.entries || []
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function openEntry(entry: {uri: string; kind: string}) {
  if (entry.kind !== 'file' || !props.tab.pluginId || !props.tab.pluginFilesystemProviderId) return
  selectedUri.value = entry.uri
  try {
    const result = await postJson<{dataBase64?: string}>(API_PATHS.communityPlugins.filesystemRead(props.tab.pluginId), {
      providerId: props.tab.pluginFilesystemProviderId,
      uri: entry.uri,
      maxBytes: 65536,
    })
    preview.value = result.dataBase64 ? atob(result.dataBase64) : ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function savePreview() {
  if (!selectedUri.value || !props.tab.pluginId || !props.tab.pluginFilesystemProviderId) return
  error.value = ''
  try {
    await postJson(API_PATHS.communityPlugins.filesystemWrite(props.tab.pluginId), {
      providerId: props.tab.pluginFilesystemProviderId,
      uri: selectedUri.value,
      dataBase64: btoa(preview.value),
    })
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

onMounted(() => {
  void refresh()
})

watch(
  () => workspace.tabActivateRefreshSeq[props.tab.id] ?? 0,
  (seq, prev) => {
    if (!seq || seq === prev) return
    void refresh()
  },
)
</script>

<template>
  <div class="community-filesystem-tab">
    <div class="community-filesystem-tab__toolbar">
      <h2>{{ t('communityPlugin.filesystemTitle') }}</h2>
      <div class="community-filesystem-tab__actions">
        <button
            type="button"
            class="community-filesystem-tab__link"
            :disabled="loading || !selectedUri"
            @click="savePreview"
        >
          {{ t('communityPlugin.filesystemSave') }}
        </button>
        <button type="button" class="community-filesystem-tab__link" :disabled="loading" @click="refresh">
          {{ t('communityPlugin.refresh') }}
        </button>
      </div>
    </div>
    <p v-if="error" class="community-filesystem-tab__error">{{ error }}</p>
    <DwSplitPane
        class="community-filesystem-tab__split"
        storage-key="dw.split.community-filesystem"
        default-ratio="half"
        :default-width="360"
        :min-width="200"
        :max-width="720"
        :end-min-width="240"
        :stack-below="720"
        start-class="community-filesystem-tab__list-pane"
        end-class="community-filesystem-tab__preview-pane"
    >
      <template #start>
        <ul v-if="entries.length" class="community-filesystem-tab__list">
          <li v-for="entry in entries" :key="entry.uri">
            <button
                type="button"
                class="community-filesystem-tab__entry"
                :class="{ 'is-selected': selectedUri === entry.uri }"
                @click="openEntry(entry)"
            >
              <span class="community-filesystem-tab__entry-name">{{ entry.name }}</span>
              <span class="community-filesystem-tab__entry-kind">{{ entry.kind }}</span>
            </button>
          </li>
        </ul>
        <EmptyState
            v-else-if="!loading"
            embedded
            compact
            :title="t('communityPlugin.filesystemEmpty')"
        />
      </template>
      <template #end>
        <textarea
            v-model="preview"
            class="community-filesystem-tab__preview"
            :placeholder="t('communityPlugin.filesystemPreview')"
        />
      </template>
    </DwSplitPane>
  </div>
</template>

<style scoped>
.community-filesystem-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: var(--dw-space-3);
  padding: var(--dw-space-5);
}

.community-filesystem-tab__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-3);
  flex-shrink: 0;
}

.community-filesystem-tab__toolbar h2 {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.community-filesystem-tab__actions {
  display: flex;
  align-items: center;
  gap: var(--dw-space-3);
}

.community-filesystem-tab__link {
  border: 0;
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.community-filesystem-tab__link:hover:not(:disabled) {
  color: var(--dw-text);
  text-decoration: underline;
}

.community-filesystem-tab__link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.community-filesystem-tab__error {
  margin: 0;
  color: var(--dw-danger);
  font-size: var(--dw-text-sm);
}

.community-filesystem-tab__split {
  flex: 1;
  min-height: 0;
}

.community-filesystem-tab__list-pane,
.community-filesystem-tab__preview-pane {
  min-height: 0;
}

.community-filesystem-tab__list {
  list-style: none;
  margin: 0;
  padding: var(--dw-space-2);
  height: 100%;
  overflow: auto;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
  font-size: var(--dw-text-sm);
}

.community-filesystem-tab__entry {
  display: flex;
  align-items: baseline;
  gap: var(--dw-space-2);
  width: 100%;
  padding: var(--dw-space-2) var(--dw-space-3);
  border: 0;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.community-filesystem-tab__entry:hover,
.community-filesystem-tab__entry.is-selected {
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.community-filesystem-tab__entry-name {
  font-weight: 600;
}

.community-filesystem-tab__entry-kind {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.community-filesystem-tab__preview {
  width: 100%;
  height: 100%;
  min-height: 12rem;
  margin: 0;
  padding: var(--dw-space-4);
  overflow: auto;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-bg) 55%, var(--dw-bg-editor));
  color: var(--dw-text);
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-xs);
  resize: none;
}
</style>
