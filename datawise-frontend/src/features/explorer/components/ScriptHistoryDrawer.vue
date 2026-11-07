<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwPanelState, EmptyState, ModalActions} from '@/core/components'
import {instanceSqlApi} from '@/api'
import type {InstanceSqlHistoryEntry} from '@/shared/api/types'
import {useScriptHistoryDrawerStore} from '@/features/explorer/stores/script-history-drawer-store'
import {restoreScriptHistoryVersion} from '@/features/explorer/services/script-history.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const {t} = useI18n()
const drawer = useScriptHistoryDrawerStore()
const layout = useLayoutStore()

const loading = ref(false)
const restoring = ref(false)
const currentSql = ref('')
const entries = ref<InstanceSqlHistoryEntry[]>([])
const selectedVersionId = ref<string | null>(null)
const selectedSql = ref('')

const target = computed(() => drawer.target)

const selectedEntry = computed(() =>
    entries.value.find((item) => item.versionId === selectedVersionId.value) ?? null,
)

const subtitle = computed(() => {
    if (!target.value) return ''
    const label = target.value.connectionLabel?.trim()
    if (label) return `${label} · ${target.value.instanceName} · ${target.value.fileName}`
    return `${target.value.instanceName} · ${target.value.fileName}`
})

const open = computed(() => drawer.open && !!target.value)

async function loadDrawerData() {
    const ctx = target.value
    if (!ctx) return
    loading.value = true
    selectedVersionId.value = null
    selectedSql.value = ''
    try {
        const [current, history] = await Promise.all([
            instanceSqlApi.read({
                connectionId: ctx.connectionId,
                instanceName: ctx.instanceName,
                fileName: ctx.fileName,
            }),
            instanceSqlApi.listHistory({
                connectionId: ctx.connectionId,
                instanceName: ctx.instanceName,
                fileName: ctx.fileName,
            }),
        ])
        currentSql.value = current.sql
        entries.value = history
        if (history.length) {
            selectedVersionId.value = history[0].versionId
            await loadSelectedVersion()
        }
    } catch {
        currentSql.value = ''
        entries.value = []
        layout.showErrorToast(t('explorer.scriptHistory.loadFailed'))
    } finally {
        loading.value = false
    }
}

async function loadSelectedVersion() {
    const ctx = target.value
    const versionId = selectedVersionId.value
    if (!ctx || !versionId) {
        selectedSql.value = ''
        return
    }
    try {
        const result = await instanceSqlApi.readHistoryVersion({
            connectionId: ctx.connectionId,
            instanceName: ctx.instanceName,
            fileName: ctx.fileName,
            versionId,
        })
        selectedSql.value = result.sql
    } catch {
        selectedSql.value = ''
        layout.showErrorToast(t('explorer.scriptHistory.versionLoadFailed'))
    }
}

async function selectVersion(versionId: string) {
    if (selectedVersionId.value === versionId) return
    selectedVersionId.value = versionId
    await loadSelectedVersion()
}

async function restoreSelected() {
    const ctx = target.value
    const versionId = selectedVersionId.value
    if (!ctx || !versionId || restoring.value) return
    restoring.value = true
    try {
        await restoreScriptHistoryVersion(ctx, versionId)
        layout.showSuccessToast(t('explorer.scriptHistory.restoreSuccess'))
        drawer.closeDrawer()
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'explorer.scriptHistory.restoreFailed')
        layout.showErrorToast(message)
    } finally {
        restoring.value = false
    }
}

function formatSavedAt(savedAt: number) {
    if (!savedAt) return '—'
    return new Date(savedAt).toLocaleString()
}

function formatSize(sizeBytes: number) {
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return ''
    if (sizeBytes < 1024) return `${sizeBytes} B`
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function closeDrawer() {
    drawer.closeDrawer()
}

watch(
    () => drawer.open,
    (isOpen) => {
        if (isOpen) void loadDrawerData()
    },
)
</script>

<template>
  <AppModal
      :open="open"
      :title="t('explorer.scriptHistory.title')"
      :subtitle="subtitle"
      width="min(960px, 94vw)"
      max-height="min(88vh, 820px)"
      close-on-backdrop
      @close="closeDrawer"
  >
    <DwPanelState
        v-if="loading"
        status="loading"
        fill
        :message="t('explorer.scriptHistory.loading')"
    />
    <EmptyState
        v-else-if="!entries.length"
        embedded
        bordered
        :title="t('explorer.scriptHistory.empty')"
        :hint="t('explorer.scriptHistory.emptyHint')"
    />
    <div v-else class="script-history">
      <section class="script-history__versions" :aria-label="t('explorer.scriptHistory.versions')">
        <header class="script-history__versions-head">
          <h3 class="script-history__section-title">{{ t('explorer.scriptHistory.versions') }}</h3>
          <span class="script-history__count">{{ entries.length }}</span>
        </header>
        <div class="script-history__list">
          <button
              v-for="entry in entries"
              :key="entry.versionId"
              class="script-history__item"
              :class="{ 'is-active': entry.versionId === selectedVersionId }"
              type="button"
              @click="selectVersion(entry.versionId)"
          >
            <span class="script-history__item-meta">
              <span class="script-history__item-time">{{ formatSavedAt(entry.savedAt) }}</span>
              <span v-if="formatSize(entry.sizeBytes)" class="script-history__item-size">
                {{ formatSize(entry.sizeBytes) }}
              </span>
            </span>
            <span class="script-history__item-preview">{{ entry.preview || t('explorer.scriptHistory.emptyPreview') }}</span>
          </button>
        </div>
      </section>

      <div class="modal-code-split modal-code-split--tall script-history__diff">
        <section class="modal-code-pane">
          <h3 class="modal-code-label">{{ t('explorer.scriptHistory.current') }}</h3>
          <pre class="modal-code-block modal-code-block--scroll">{{ currentSql || '—' }}</pre>
        </section>
        <section class="modal-code-pane">
          <h3 class="modal-code-label">
            {{ t('explorer.scriptHistory.selected') }}
            <span v-if="selectedEntry" class="modal-inline-meta">{{ formatSavedAt(selectedEntry.savedAt) }}</span>
          </h3>
          <pre class="modal-code-block modal-code-block--scroll modal-code-block--accent">{{ selectedSql || '—' }}</pre>
        </section>
      </div>
    </div>

    <template v-if="!loading && entries.length" #footer>
      <ModalActions
          :confirm-label="t('explorer.scriptHistory.restore')"
          :cancel-label="t('common.cancel')"
          :confirm-disabled="!selectedVersionId || restoring"
          :confirm-loading="restoring"
          @cancel="closeDrawer"
          @confirm="restoreSelected"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.script-history {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-7);
  min-height: 0;
  flex: 1;
}

.script-history__versions {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
  min-height: 0;
}

.script-history__versions-head {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
}

.script-history__section-title {
  margin: 0;
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
}

.script-history__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4em;
  padding: 0 var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.script-history__list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  max-height: min(28vh, 220px);
  overflow: auto;
  padding: var(--dw-space-1);
  margin: calc(-1 * var(--dw-space-1));
}

.script-history__item {
  display: grid;
  gap: var(--dw-space-2);
  padding: var(--dw-space-5) var(--dw-space-6);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-panel-shadow);
  text-align: left;
  cursor: pointer;
  transition:
      border-color var(--dw-duration-fast) var(--dw-ease),
      background var(--dw-duration-fast) var(--dw-ease),
      box-shadow var(--dw-duration-fast) var(--dw-ease);
}

.script-history__item:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 22%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 5%, var(--dw-bg-panel));
}

.script-history__item.is-active {
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-panel));
  box-shadow:
      var(--dw-panel-shadow),
      inset 3px 0 0 var(--dw-primary);
}

.script-history__item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  min-width: 0;
}

.script-history__item-time {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text);
}

.script-history__item-size {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-variant-numeric: tabular-nums;
}

.script-history__item-preview {
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
  line-height: var(--dw-leading-snug);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.script-history__diff {
  flex: 1;
  min-height: 280px;
}

.script-history__diff :deep(.modal-code-block) {
  font-family: var(--dw-mono);
  background: var(--dw-bg-editor);
  border-color: var(--dw-panel-border);
}

.script-history__diff :deep(.modal-code-block--accent) {
  border-color: color-mix(in srgb, var(--dw-primary) 32%, var(--dw-panel-border));
  background: color-mix(in srgb, var(--dw-primary) 5%, var(--dw-bg-editor));
}
</style>
