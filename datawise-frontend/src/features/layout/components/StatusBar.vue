<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import ResizeHandle from '@/core/components/ResizeHandle.vue'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {isSlowDurationMs} from '@/features/workspace/services/slow-query.utils'
import {canOpenRuntimeLog, openRuntimeLog} from '@/features/layout/services/open-runtime-log.service'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {bootstrapProgress} from '@/app/services/bootstrap-app.service'
import {useStartupPhaseLabel} from '@/app/composables/useStartupPhaseLabel'
import {
    desktopStartupProgress,
    type BackendStartupPhase,
} from '@/features/layout/services/desktop-backend-startup.service'
import {backendHealth} from '@/features/layout/services/backend-health.service'
import ExplorerStatusBreadcrumb from '@/features/layout/components/ExplorerStatusBreadcrumb.vue'
import ModuleHeroSettingsMenu, {type ModuleHeroMenuItem} from '@/core/components/ModuleHeroSettingsMenu.vue'
import StatusBarQuickLaunch from '@/features/layout/components/StatusBarQuickLaunch.vue'
import {useExplorerStatusPath} from '@/features/explorer/composables/useExplorerStatusPath'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {listEndingTrials} from '@/features/pack/services/trial-ending'
import {useProjectStore} from '@/features/project/stores/project'

const PATH_WIDTH_KEY = 'dw.statusBar.pathWidth'
const QUICK_WIDTH_KEY = 'dw.statusBar.quickWidth'
const PATH_WIDTH_DEFAULT = 280
const QUICK_WIDTH_DEFAULT = 300
const PATH_WIDTH_MIN = 120
const PATH_WIDTH_MAX = 520
const QUICK_WIDTH_MIN = 72
const QUICK_WIDTH_MAX = 560

function readPersistedWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.round(n)))
  } catch {
    return fallback
  }
}

function writePersistedWidth(key: string, value: number) {
  try {
    localStorage.setItem(key, String(Math.round(value)))
  } catch {
    /* ignore quota / private mode */
  }
}

const {t} = useI18n()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const editorSettings = useEditorSettingsStore()
const entitlement = useEntitlementStore()
const projectStore = useProjectStore()
const {hasPath: hasExplorerPath} = useExplorerStatusPath()
const desktopApp = isDesktopApp()
const startupStatusText = useStartupPhaseLabel()

const pathWidth = ref(readPersistedWidth(PATH_WIDTH_KEY, PATH_WIDTH_DEFAULT, PATH_WIDTH_MIN, PATH_WIDTH_MAX))
const quickWidth = ref(readPersistedWidth(QUICK_WIDTH_KEY, QUICK_WIDTH_DEFAULT, QUICK_WIDTH_MIN, QUICK_WIDTH_MAX))

watch(pathWidth, (value) => writePersistedWidth(PATH_WIDTH_KEY, value))
watch(quickWidth, (value) => writePersistedWidth(QUICK_WIDTH_KEY, value))

const projectChipLabel = computed(() => projectStore.displayName)

const showStartupProgress = computed(
    () => desktopApp && !bootstrapProgress.startupComplete,
)

const desktopBackendStarting = computed(() => {
    if (!desktopApp) return false
    const phase = desktopStartupProgress.phase
    return phase === 'config' || phase === 'spawning' || phase === 'warming'
})

const backendOnline = computed(() => backendHealth.status === 'online')

const backendConnecting = computed(() => {
    if (backendOnline.value) return false
    if (backendHealth.status === 'offline') return false
    if (desktopBackendStarting.value) return true
    return backendHealth.status === 'idle' || backendHealth.status === 'connecting'
})

const backendOffline = computed(() => backendHealth.status === 'offline')

const idleStatusText = computed(() => {
    if (backendOnline.value) return t('status.ready')
    if (backendConnecting.value) return t('status.backendConnecting')
    return t('status.backendOffline')
})

const idleTone = computed(() => {
    if (backendOffline.value) return 'offline'
    if (backendConnecting.value) return 'connecting'
    return 'ready'
})

const isIdle = computed(() => {
    const {duration, rowCount} = workspace.status
    return duration === '-' && rowCount === '-'
})

const isSlowExecution = computed(() => {
    const durationMs = workspace.status.durationMs
    if (durationMs == null || !Number.isFinite(durationMs)) return false
    return isSlowDurationMs(durationMs, editorSettings.settings.slowQueryThresholdMs)
})

const showRuntimeLogAction = computed(() => canOpenRuntimeLog())
const exportPanelOpen = computed(() => layout.activeShortcutPanel === 'export')

/** 只有时间敏感的续费/试用提醒才常驻，其余收进「更多」菜单（P1-3 chrome 收敛） */
const entitlementUrgent = computed(
    () => endingTrialCount.value > 0 || entitlement.lockedCount > 0,
)

const endMenuItems = computed<ModuleHeroMenuItem[]>(() => {
    const items: ModuleHeroMenuItem[] = [
        {
            id: 'project',
            label: t('status.menuProject', {name: projectChipLabel.value}),
            disabled: true,
        },
    ]
    if (showEntitlementChip.value) {
        items.push({id: 'entitlement', label: entitlementChipLabel.value})
    }
    if (showRuntimeLogAction.value) {
        items.push({id: 'runtimeLog', label: t('shortcut.runtimeLog.title'), icon: 'file'})
    }
    items.push({
        id: 'export',
        label: t('status.showAll'),
        icon: 'export',
        dividerBefore: true,
    })
    return items
})

function onEndMenuSelect(id: string) {
    if (id === 'entitlement') openPackStore()
    else if (id === 'runtimeLog') void onOpenRuntimeLog()
    else if (id === 'export') toggleExportPanel()
}

const showEntitlementChip = computed(
    () => entitlement.ready && entitlement.mode === 'enforced',
)

const endingTrialCount = computed(() => listEndingTrials(entitlement.catalogItems).length)

const entitlementTone = computed(() => {
    if (endingTrialCount.value > 0) return 'warn'
    if (entitlement.lockedCount > 0) return 'locked'
    return 'ok'
})

const entitlementChipTitle = computed(() => {
    if (endingTrialCount.value > 0) {
        return t('status.entitlementTrialEnding', {count: endingTrialCount.value})
    }
    if (entitlement.lockedCount > 0) {
        return t('status.entitlementLocked', {count: entitlement.lockedCount})
    }
    return t('status.entitlementLicensed')
})

const entitlementChipLabel = computed(() => {
    if (endingTrialCount.value > 0) {
        return t('status.entitlementChipTrial', {count: endingTrialCount.value})
    }
    if (entitlement.lockedCount > 0) {
        return t('status.entitlementChipLocked', {count: entitlement.lockedCount})
    }
    return t('status.entitlementChipOk')
})

function toggleExportPanel() {
    layout.toggleShortcutPanel('export')
}

function openPackStore() {
    layout.setModule('packStore')
}

async function onOpenRuntimeLog() {
    const result = await openRuntimeLog()
    if (result.ok) return
    if (result.error === 'missing') {
        layout.showErrorToast(t('shortcut.runtimeLog.missing', {path: result.path ?? ''}))
        return
    }
    if (result.error === 'open_failed') {
        layout.showErrorToast(t('shortcut.runtimeLog.openFailed'))
        return
    }
    layout.showErrorToast(t('shortcut.runtimeLog.unsupported'))
}
</script>

<template>
  <footer class="status-bar" role="contentinfo">
    <div
        v-if="hasExplorerPath"
        class="status-bar__path"
        :style="{width: `${pathWidth}px`}"
    >
      <ExplorerStatusBreadcrumb/>
      <ResizeHandle
          v-model="pathWidth"
          variant="line"
          :min="PATH_WIDTH_MIN"
          :max="PATH_WIDTH_MAX"
          class="status-bar__split status-bar__split--trailing"
      />
    </div>

    <StatusBarQuickLaunch
        v-model:width="quickWidth"
        :show-leading-handle="!hasExplorerPath"
        :min-width="QUICK_WIDTH_MIN"
        :max-width="QUICK_WIDTH_MAX"
    />

    <div class="status-bar__main">
      <div v-if="showStartupProgress" class="status-bar__startup">
        <span class="status-bar__startup-label">{{ startupStatusText }}</span>
        <div class="status-bar__startup-indeterminate" role="progressbar" aria-busy="true">
          <span class="status-bar__startup-indeterminate-fill"/>
        </div>
      </div>

      <span
          v-else-if="isIdle"
          class="status-bar__health"
          :class="`status-bar__health--${idleTone}`"
      >
        <span class="status-bar__dot" aria-hidden="true"/>
        {{ idleStatusText }}
      </span>

      <template v-else>
        <span class="status-bar__message" :title="workspace.status.message">
          {{ workspace.status.message }}
        </span>
        <div class="status-bar__metrics" aria-label="query metrics">
          <span class="status-bar__metric">
            <span class="status-bar__metric-label">{{ t('status.timeLabel') }}</span>
            <span
                class="status-bar__metric-value"
                :class="{ 'status-bar__metric-value--slow': isSlowExecution }"
            >{{ workspace.status.duration }}</span>
          </span>
          <span class="status-bar__metric">
            <span class="status-bar__metric-label">{{ t('status.rowsLabel') }}</span>
            <span class="status-bar__metric-value">{{ workspace.status.rowCount }}</span>
          </span>
        </div>
      </template>
    </div>

    <div class="status-bar__end">
      <button
          v-if="showEntitlementChip && entitlementUrgent"
          type="button"
          class="status-bar__chip"
          :class="`status-bar__chip--${entitlementTone}`"
          :title="entitlementChipTitle"
          data-testid="status-entitlement-chip"
          @click="openPackStore"
      >
        {{ entitlementChipLabel }}
      </button>
      <ModuleHeroSettingsMenu
          :ariaLabel="t('status.menuLabel')"
          icon="ellipsis"
          placement="up"
          :active="exportPanelOpen"
          :items="endMenuItems"
          @select="onEndMenuSelect"
      />
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: var(--dw-space-3);
  height: var(--dw-status-height);
  padding: 0 var(--dw-space-3) 0 var(--dw-space-5);
  border-top: none;
  background: var(--dw-bg-chrome);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-tight);
  user-select: none;
}

.status-bar__path {
  position: relative;
  flex: 0 0 auto;
  min-width: 0;
  padding-right: var(--dw-space-3);
  overflow: hidden;
}

.status-bar__split {
  position: absolute;
  top: 4px;
  bottom: 4px;
  z-index: 2;
  width: 5px !important;
  height: auto !important;
}

.status-bar__split--trailing {
  right: 0;
  transform: translateX(50%);
}

.status-bar__main {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--dw-space-4);
  flex: 0 1 auto;
  min-width: 0;
  margin-left: auto;
  padding-left: var(--dw-space-4);
}

.status-bar__end {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-3);
  flex-shrink: 0;
}

.status-bar__health {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
  color: var(--dw-text-muted);
  white-space: nowrap;
}

.status-bar__health--connecting {
  color: var(--dw-text-secondary);
}

.status-bar__health--offline {
  color: var(--dw-warning-fg);
}

.status-bar__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dw-success);
  flex-shrink: 0;
}

.status-bar__health--connecting .status-bar__dot {
  background: var(--dw-warning);
}

.status-bar__health--offline .status-bar__dot {
  background: var(--dw-warning);
}

.status-bar__startup {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-md);
  min-width: 0;
  flex: 1;
  max-width: 360px;
}

.status-bar__startup-label {
  flex-shrink: 0;
  color: var(--dw-text-secondary);
  white-space: nowrap;
}

.status-bar__startup-indeterminate {
  position: relative;
  flex: 1;
  min-width: 72px;
  height: 3px;
  border-radius: var(--dw-radius-pill);
  overflow: hidden;
  background: color-mix(in srgb, var(--dw-text) 8%, var(--dw-bg-panel));
}

.status-bar__startup-indeterminate-fill {
  position: absolute;
  top: 0;
  left: 0;
  width: 42%;
  height: 100%;
  border-radius: inherit;
  background: var(--dw-primary);
  animation: status-bar-boot-slide 1.35s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes status-bar-boot-slide {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}

.status-bar__message {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-text);
  font-weight: 500;
}

.status-bar__metrics {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-4);
  flex-shrink: 0;
  color: var(--dw-text-muted);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
}

.status-bar__metric {
  display: inline-flex;
  align-items: baseline;
  gap: var(--dw-space-2);
}

.status-bar__metric-label {
  color: var(--dw-text-muted);
}

.status-bar__metric-value {
  color: var(--dw-text-secondary);
  font-variant-numeric: tabular-nums;
}

.status-bar__metric-value--slow {
  color: var(--dw-danger);
  font-weight: 600;
}

.status-bar__chip {
  display: inline-flex;
  align-items: center;
  max-width: 9.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  height: 22px;
  padding: 0 var(--dw-space-3);
  border: 0;
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-success) 10%, transparent);
  color: var(--dw-success-fg);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: filter var(--dw-duration-fast) var(--dw-ease);
}

.status-bar__chip:hover {
  filter: brightness(1.06);
}

.status-bar__chip--warn {
  background: color-mix(in srgb, var(--dw-warning) 14%, transparent);
  color: var(--dw-warning-fg);
}

.status-bar__chip--locked {
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  color: var(--dw-text-muted);
}

</style>
