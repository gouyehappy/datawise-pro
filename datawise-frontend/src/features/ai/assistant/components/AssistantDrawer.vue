<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useI18n} from 'vue-i18n'
import ToolWindowShell from '@/features/layout/components/ToolWindowShell.vue'
import {IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {
  SHORTCUT_PANEL_RESIZE_MIN,
  useSidePanelResizeBounds,
} from '@/core/composables/useSidePanelResizeBounds'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import AiChatMessageList from '@/features/ai/chat/components/AiChatMessageList.vue'
import AiChatComposer from '@/features/ai/chat/components/AiChatComposer.vue'
import {useAiAssistantChatStore} from '@/features/ai/stores/ai-chat'
import {useAiChatSend} from '@/features/ai/chat/composables/useAiChatSend'
import {useAiChatScroll} from '@/features/ai/chat/composables/useAiChatScroll'
import {extractSqlFromContent} from '@/features/ai/chat/services/ai-chat.service'
import {useAiConsoleBridge} from '@/features/ai/shared/composables/useAiConsoleBridge'
import {useAiDocumentBridge} from '@/features/ai/shared/composables/useAiDocumentBridge'
import {useTenantAiQuota} from '@/features/ai/shared/composables/useTenantAiQuota'
import {buildWorkbenchContextSnapshot} from '@/features/ai/context/services/build-workbench-context'
import {formatWorkbenchFocusHint} from '@/features/ai/work-context/ai-work-context.service'
import {
  describeWorkbenchFocusSelection,
  hasWorkbenchFocus,
  resolveTargetIdsFromWorkbenchFocus,
} from '@/features/ai/context/services/resolve-targets-from-focus'
import {useAiTaggedScope} from '@/features/ai/datasource/composables/useAiTaggedScope'
import {useAiDatabaseScope} from '@/features/ai/datasource/composables/useAiDatabaseScope'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {usePanelHeaderDrag} from '@/features/dock/composables/usePanelHeaderDrag'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {
  clampAssistantFloatGeometry,
  readAssistantFloatGeometry,
  writeAssistantFloatGeometry,
} from '@/features/ai/assistant/services/assistant-float-geometry.service'
import AssistantHistoryPopover from '@/features/ai/assistant/components/AssistantHistoryPopover.vue'
import AiConversationBindingBanner from '@/features/ai/context/components/AiConversationBindingBanner.vue'
import type {AiChatMode} from '@/features/ai/types/session'

const props = withDefaults(
    defineProps<{
      /** 嵌在右侧 ShortcutRail，挤开工作区（与通知抽屉同轨） */
      embedded?: boolean
      /** Allow dragging the whole shortcut rail via this drawer header. */
      headerDraggable?: boolean
    }>(),
    {embedded: false, headerDraggable: false},
)

const {t, tm} = useI18n()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()
const entitlement = useEntitlementStore()
const aiChat = useAiAssistantChatStore()
const {onPointerDown: onDockHeaderPointerDown} = usePanelHeaderDrag('shortcut')
const {min: resizeMin, max: resizeMax} = useSidePanelResizeBounds({
  min: SHORTCUT_PANEL_RESIZE_MIN,
})
const {activeSession, activeSessionId, sortedSessions} = storeToRefs(aiChat)
const {tabs, activeTab} = storeToRefs(workspace)
const {tree, selectedNodeId} = storeToRefs(explorer)

const FLOAT_MIN_H = 320
const FLOAT_DEFAULT_H = 560

/** Standalone free-float geometry (not dock placement). */
const floatX = ref(0)
const floatY = ref(0)
const floatH = ref(FLOAT_DEFAULT_H)
const floatPlaced = ref(false)

function floatBounds() {
  return {
    minW: resizeMin,
    maxW: resizeMax.value,
    minH: FLOAT_MIN_H,
    maxH: Math.max(FLOAT_MIN_H, window.innerHeight - 48),
  }
}

function persistStandaloneFloat() {
  if (props.embedded || typeof window === 'undefined') return
  const w = Math.min(resizeMax.value, Math.max(resizeMin, appConfig.shortcutPanelWidth))
  writeAssistantFloatGeometry({
    x: floatX.value,
    y: floatY.value,
    w,
    h: floatH.value,
  })
}

function placeStandaloneFloat() {
  if (typeof window === 'undefined') return
  const bounds = floatBounds()
  const saved = readAssistantFloatGeometry()
  if (saved) {
    const clamped = clampAssistantFloatGeometry(
        {
          ...saved,
          w: saved.w || appConfig.shortcutPanelWidth,
        },
        bounds,
    )
    floatX.value = clamped.x
    floatY.value = clamped.y
    floatH.value = clamped.h
    if (Math.abs(clamped.w - appConfig.shortcutPanelWidth) > 1) {
      appConfig.setShortcutPanelWidth(clamped.w)
    }
  } else {
    const width = Math.min(bounds.maxW, Math.max(bounds.minW, appConfig.shortcutPanelWidth))
    floatX.value = Math.max(16, window.innerWidth - width - 24)
    floatY.value = 24
    floatH.value = Math.min(bounds.maxH, Math.max(FLOAT_MIN_H, FLOAT_DEFAULT_H))
  }
  floatPlaced.value = true
}

const floatStyle = computed(() => {
  if (props.embedded) return undefined
  const width = Math.min(resizeMax.value, Math.max(resizeMin, appConfig.shortcutPanelWidth))
  return {
    left: `${floatX.value}px`,
    top: `${floatY.value}px`,
    width: `${width}px`,
    height: `${floatH.value}px`,
    right: 'auto',
    bottom: 'auto',
  }
})

/* ── standalone header move ── */
let movePtr: number | null = null
let moveStartX = 0
let moveStartY = 0
let moveOriginX = 0
let moveOriginY = 0

function onStandaloneHeaderPointerDown(event: PointerEvent) {
  if (props.embedded || event.button !== 0) return
  const target = event.target as HTMLElement | null
  if (target?.closest('button, a, input, select, textarea, [role="button"]')) return
  event.preventDefault()
  movePtr = event.pointerId
  moveStartX = event.clientX
  moveStartY = event.clientY
  moveOriginX = floatX.value
  moveOriginY = floatY.value
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'grabbing'
  window.addEventListener('pointermove', onStandaloneMove)
  window.addEventListener('pointerup', endStandaloneMove)
  window.addEventListener('pointercancel', endStandaloneMove)
}

function onStandaloneMove(event: PointerEvent) {
  if (movePtr !== event.pointerId) return
  const width = Math.min(resizeMax.value, Math.max(resizeMin, appConfig.shortcutPanelWidth))
  const maxX = Math.max(0, window.innerWidth - width)
  const maxY = Math.max(0, window.innerHeight - floatH.value)
  floatX.value = Math.min(maxX, Math.max(0, moveOriginX + (event.clientX - moveStartX)))
  floatY.value = Math.min(maxY, Math.max(0, moveOriginY + (event.clientY - moveStartY)))
}

function endStandaloneMove() {
  movePtr = null
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  window.removeEventListener('pointermove', onStandaloneMove)
  window.removeEventListener('pointerup', endStandaloneMove)
  window.removeEventListener('pointercancel', endStandaloneMove)
  persistStandaloneFloat()
}

function onHeaderPointerDown(event: PointerEvent) {
  if (props.embedded) {
    onDockHeaderPointerDown(event)
    return
  }
  onStandaloneHeaderPointerDown(event)
}

/* ── standalone resize (SE corner only — no left-edge bar) ── */
let resizing = false
let resizePtr: number | null = null
let resizeStartX = 0
let resizeStartY = 0
let resizeOrigin = {w: 0, h: 0}

function onResizePointerDown(event: PointerEvent) {
  if (props.embedded || event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  resizing = true
  resizePtr = event.pointerId
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  resizeOrigin = {
    w: Math.min(resizeMax.value, Math.max(resizeMin, appConfig.shortcutPanelWidth)),
    h: floatH.value,
  }
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
}

function onResizeMove(event: PointerEvent) {
  if (!resizing || resizePtr !== event.pointerId) return
  const dx = event.clientX - resizeStartX
  const dy = event.clientY - resizeStartY
  const nextW = Math.min(resizeMax.value, Math.max(resizeMin, resizeOrigin.w + dx))
  appConfig.setShortcutPanelWidth(nextW)
  const maxH = Math.max(FLOAT_MIN_H, window.innerHeight - floatY.value - 8)
  floatH.value = Math.min(maxH, Math.max(FLOAT_MIN_H, resizeOrigin.h + dy))
}

function endResize() {
  resizing = false
  resizePtr = null
  document.body.style.userSelect = ''
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
  persistStandaloneFloat()
}

onBeforeUnmount(() => {
  endStandaloneMove()
  endResize()
})

const input = ref('')
const listRef = ref<InstanceType<typeof AiChatMessageList>>()
const composerRef = ref<InstanceType<typeof AiChatComposer>>()

const taggedScope = useAiTaggedScope()
const {
  allTargets,
  selectedTargets,
  removeTarget,
  formatTargetLabel,
} = useAiDatabaseScope(taggedScope, aiChat)

const {scrollToBottom} = useAiChatScroll(
    computed(() => listRef.value?.getScrollEl?.()),
    activeSessionId,
)
const activeBinding = computed(() => aiChat.activeSession?.binding ?? null)
const {openInConsole} = useAiConsoleBridge(selectedTargets, activeBinding)
const {
  canApplyToDocument,
  canUndoApplyToDocument,
  documentApplyTargetLabel,
  applyToDocument,
  undoApplyToDocument,
} = useAiDocumentBridge()
const {
  usage: tenantAiUsage,
  exhausted: tenantAiExhausted,
  refreshIfLimited: refreshTenantAiUsageIfLimited,
} = useTenantAiQuota()

const {
  send,
  stop,
  analysisSteps,
  analysisStreaming,
  chatStreaming,
  sqlConfirmPending,
  resumingSql,
  confirmSqlExecution,
  cancelSqlExecution,
} = useAiChatSend({
  allTargets,
  chatStore: aiChat,
  scrollToBottom,
  clearInput: () => {
    input.value = ''
    composerRef.value?.clearAttachments()
  },
  restoreInput: (value) => {
    input.value = value
  },
  getInput: () => input.value,
  getAttachments: () => composerRef.value?.getAttachments() ?? [],
  buildPrompt: async (prompt) => {
    const base = (await composerRef.value?.buildSendPayload(prompt)) ?? prompt
    const snap = currentSnapshot()
    if (!snap.online || !hasWorkbenchFocus(snap.focus)) return base
    // File / local doc focus must always carry body preview so the model can edit it.
    const isFileFocus = snap.focus.objectKind === 'file' || !!snap.focus.resourcePath
    if (selectedTargets.value.length > 0 && !isFileFocus) return base
    return `${formatWorkbenchFocusHint(snap)}\n\n${base}`
  },
})

/** Hide Agent marketing welcome — drawer has its own empty state */
const messages = computed(
    () => (activeSession.value?.messages ?? []).filter((msg) => msg.kind !== 'welcome'),
)
const quickPrompts = computed(() => tm('assistant.quickPrompts') as string[])
const userInitial = computed(() => layout.profileName.trim().charAt(0).toUpperCase() || 'U')
const sending = computed(() => aiChat.isSending() || !!sqlConfirmPending.value || resumingSql.value)
const isEmpty = computed(() => messages.value.length === 0 && !sending.value && !sqlConfirmPending.value)
const showQuickPrompts = computed(
    () => isEmpty.value && !!activeSession.value,
)

const focusLabel = computed(() => {
  const snap = currentSnapshot()
  if (!hasWorkbenchFocus(snap.focus)) return t('assistant.focusEmpty')
  return describeWorkbenchFocusSelection(snap.focus) || t('assistant.focusEmpty')
})

function currentSnapshot() {
  return buildWorkbenchContextSnapshot({
    tabs: tabs.value,
    activeTab: activeTab.value,
    explorerTree: tree.value,
    selectedNodeId: selectedNodeId.value,
    layoutModule: layout.activeModule,
  })
}

/** Map live workbench focus onto AI tagged-scope targets (same as Agent default). */
function applyWorkbenchFocusToScope(options?: {force?: boolean}) {
  const snap = currentSnapshot()
  const ids = resolveTargetIdsFromWorkbenchFocus(allTargets.value, snap.focus)
  const session = aiChat.activeSession
  if (session && snap.focus.connectionId) {
    aiChat.seedSessionBindingIfEmpty(session.id, {
      connectionId: snap.focus.connectionId,
      connectionName: snap.focus.connectionName,
      database: snap.focus.database,
      schema: snap.focus.schema,
      dialect: snap.focus.dialect,
      environment: snap.focus.environment,
      source: 'workbench_focus',
    })
  }
  if (!ids.length) return ids
  const validSelected = (session?.selectedTargetIds ?? []).filter((id) =>
    allTargets.value.some((target) => target.id === id),
  )
  if (options?.force || validSelected.length === 0) {
    aiChat.setSelectedTargetIds(ids)
  }
  return ids
}

function onBindingModeChange(mode: AiChatMode) {
  const id = activeSessionId.value
  if (!id) return
  aiChat.setSessionMode(id, mode)
  if (mode === 'ask' && sqlConfirmPending.value && !resumingSql.value) {
    void cancelSqlExecution()
  }
}

function onNewChatFromFocus() {
  const session = aiChat.createSession(resolveFocusTargetIds())
  const snap = currentSnapshot()
  if (snap.focus.connectionId) {
    aiChat.setSessionBinding(session.id, {
      connectionId: snap.focus.connectionId,
      connectionName: snap.focus.connectionName,
      database: snap.focus.database,
      schema: snap.focus.schema,
      dialect: snap.focus.dialect,
      environment: snap.focus.environment,
      source: 'workbench_focus',
    })
  }
  void scrollToBottom({force: true})
}

function resolveFocusTargetIds() {
  return resolveTargetIdsFromWorkbenchFocus(allTargets.value, currentSnapshot().focus)
}

function close() {
  layout.showAssistantDrawer = false
}

/** AUDIT-02: Escape dismisses the assistant tool window. */
usePopoverEscape(() => layout.showAssistantDrawer, close)

function openFullAgent() {
  if (!entitlement.guardAiNav()) return
  layout.showAssistantDrawer = false
  layout.setModule('ai')
}

function onNewChat() {
  aiChat.createSession(resolveFocusTargetIds())
  void scrollToBottom({force: true})
}

function onSelectHistory(id: string) {
  stop()
  aiChat.selectSession(id)
  applyWorkbenchFocusToScope({force: false})
  void scrollToBottom({force: true})
}

function onDeleteHistory(id: string) {
  if (id === activeSessionId.value) stop()
  aiChat.deleteSession(id)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (tenantAiExhausted.value) return
    void composerRef.value?.buildSendPayload(input.value.trim()).then((prompt) => {
      if (!prompt) return
      void onSend(prompt)
    })
  }
}

async function onSend(prompt: string) {
  if (tenantAiExhausted.value) return
  await refreshTenantAiUsageIfLimited()
  if (tenantAiExhausted.value) return
  await send(prompt)
}

function onQuickPrompt(prompt: string) {
  input.value = prompt
  void onSend(prompt)
}

watch(
    () => layout.showAssistantDrawer,
    (open) => {
      if (!open) {
        if (!props.embedded && floatPlaced.value) persistStandaloneFloat()
        // Abort in-flight work; sessions stay persisted for history restore.
        stop()
        return
      }
      aiChat.ensureInitialized(resolveFocusTargetIds())
      applyWorkbenchFocusToScope({force: true})
      void taggedScope.reload()
      if (!props.embedded) {
        // Re-clamp (or restore) so a resized viewport still fits the panel.
        placeStandaloneFloat()
      }
      void scrollToBottom({force: true})
    },
    {immediate: true},
)

/** When tagged catalog arrives / focus tree changes while open, re-seed empty scope. */
watch(
    [allTargets, selectedNodeId, activeTab],
    () => {
      if (!layout.showAssistantDrawer) return
      applyWorkbenchFocusToScope({force: false})
    },
)
</script>

<template>
  <div
      v-if="layout.showAssistantDrawer"
      class="tool-window-host assistant-drawer"
      :class="{ 'tool-window--standalone': !props.embedded, 'assistant-drawer--free': !props.embedded }"
      :style="floatStyle"
  >
    <ToolWindowShell
        :title="t('assistant.title')"
        :collapse-label="t('common.close')"
        :header-draggable="props.embedded ? headerDraggable : true"
        :dock-panel="props.embedded ? 'shortcut' : undefined"
        :body-scroll="false"
        @collapse="close"
        @header-pointerdown="onHeaderPointerDown"
    >
      <template #head-text>
        <h3 class="assistant-drawer__title">{{ t('assistant.title') }}</h3>
      </template>

      <template #head-actions>
        <AssistantHistoryPopover
            :sessions="sortedSessions"
            :active-session-id="activeSessionId"
            @select="onSelectHistory"
            @create="onNewChat"
            @delete="onDeleteHistory"
        />
        <span class="assistant-drawer__actions-rule" aria-hidden="true"/>
        <IconButton
            size="sm"
            :title="t('assistant.openAgent')"
            @click="openFullAgent"
        >
          <DwIcon name="ai" size="sm" :stroke-width="1.5"/>
        </IconButton>
        <IconButton
            size="sm"
            :title="t('assistant.newChat')"
            @click="onNewChat"
        >
          <DwIcon name="plus" size="sm" :stroke-width="1.5"/>
        </IconButton>
      </template>

      <div class="assistant-drawer__body">
        <AiConversationBindingBanner
            v-if="activeSession"
            variant="panel"
            :mode="activeSession.mode ?? 'agent'"
            :binding="activeSession.binding"
            @update:mode="onBindingModeChange"
            @new-from-focus="onNewChatFromFocus"
        />
        <div
            v-if="focusLabel && !activeSession?.binding?.connectionId"
            class="assistant-drawer__context"
            :title="focusLabel"
        >
          <DwIcon name="locate" size="sm" :stroke-width="1.5" aria-hidden="true"/>
          <span>{{ focusLabel }}</span>
        </div>
        <div class="assistant-drawer__messages">
          <AiChatMessageList
              ref="listRef"
              compact
              :messages="messages"
              :sending="sending"
              :show-quick-prompts="showQuickPrompts"
              :quick-prompts="quickPrompts"
              :user-initial="userInitial"
              :capabilities="[]"
              :extract-sql="extractSqlFromContent"
              :session-id="activeSessionId"
              :analysis-steps="analysisSteps"
              :analysis-streaming="analysisStreaming"
              :chat-streaming="chatStreaming"
              :sql-confirm-pending="sqlConfirmPending"
              :resuming-sql="resumingSql"
              :can-apply-to-document="canApplyToDocument"
              :can-undo-apply-to-document="canUndoApplyToDocument"
              :document-apply-target-label="documentApplyTargetLabel"
              @open-in-console="openInConsole"
              @apply-to-document="applyToDocument"
              @undo-apply-to-document="undoApplyToDocument"
              @quick-prompt="onQuickPrompt"
              @confirm-sql="confirmSqlExecution"
              @cancel-sql="cancelSqlExecution"
          >
            <template v-if="isEmpty" #empty>
              <div class="assistant-empty">
                <div class="assistant-empty__mark" aria-hidden="true">
                  <DwIcon name="ai" size="md" :stroke-width="1.5"/>
                </div>
                <p class="assistant-empty__title">{{ t('assistant.welcomeTitle') }}</p>
                <p class="assistant-empty__hint">{{ t('assistant.welcomeHint') }}</p>
                <button type="button" class="assistant-empty__link" @click="openFullAgent">
                  {{ t('assistant.openAgent') }}
                  <DwIcon name="chevron-right" size="sm" :stroke-width="1.5"/>
                </button>
              </div>
            </template>
          </AiChatMessageList>
        </div>

        <div class="assistant-drawer__composer">
          <p v-if="tenantAiUsage && !tenantAiUsage.unlimited" class="assistant-drawer__quota">
            {{ t('ai.quota.meterProgress', {calls: tenantAiUsage.calls, limit: tenantAiUsage.limit}) }}
          </p>
          <AiChatComposer
              ref="composerRef"
              v-model="input"
              :sending="sending"
              :quota-exhausted="tenantAiExhausted"
              :selected-targets="selectedTargets"
              :format-target-label="formatTargetLabel"
              @send="onSend"
              @stop="stop"
              @remove-target="removeTarget"
              @keydown="onKeydown"
          />
        </div>
      </div>
    </ToolWindowShell>

    <span
        v-if="!props.embedded"
        class="assistant-drawer__handle assistant-drawer__handle--se"
        :title="`${t('common.resizeWidth')} / ${t('common.resizeHeight')}`"
        @pointerdown="onResizePointerDown($event)"
    />
  </div>
</template>

<style scoped>
.assistant-drawer.tool-window--standalone {
  z-index: calc(var(--dw-z-overlay) + 1);
}

.assistant-drawer :deep(.tool-window__head) {
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 6px 8px 6px 10px;
  border-bottom-color: color-mix(in srgb, var(--dw-border) 55%, transparent);
  background: transparent;
}

.assistant-drawer__title {
  margin: 0;
  font-size: var(--dw-font-size);
  font-weight: 650;
  letter-spacing: 0.01em;
  line-height: 1.2;
  color: var(--dw-text);
}

.assistant-drawer__actions-rule {
  display: inline-block;
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: color-mix(in srgb, var(--dw-border) 85%, transparent);
}

.assistant-drawer__context {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin: 8px 10px 0;
  padding: 5px 9px 5px 7px;
  border: 1px solid color-mix(in srgb, var(--dw-border) 55%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dw-bg-panel) 55%, transparent);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: 1.35;
}

.assistant-drawer__context :deep(svg) {
  flex: 0 0 auto;
  color: var(--dw-text-muted);
  opacity: 0.9;
}

.assistant-drawer__context span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * Body scroll is owned by .chat-scroll (ToolWindowShell body-scroll=false)
 * so long streams stay scrollable while the composer stays pinned.
 */
.assistant-drawer :deep(.tool-window__body--plain) {
  flex: 1;
  min-height: 0;
}

.assistant-drawer__handle--se {
  position: absolute;
  z-index: 3;
  right: 2px;
  bottom: 2px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  opacity: 0.45;
  background:
      linear-gradient(
          135deg,
          transparent 0 46%,
          color-mix(in srgb, var(--dw-text-muted) 70%, transparent) 46% 52%,
          transparent 52% 62%,
          color-mix(in srgb, var(--dw-text-muted) 70%, transparent) 62% 68%,
          transparent 68%
      );
}

.assistant-drawer__handle--se:hover {
  opacity: 0.9;
}

.assistant-drawer__body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.assistant-drawer__messages {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.assistant-drawer__messages :deep(.chat-scroll) {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

/* Compact analysis cards: denser, less full-page chrome */
.assistant-drawer__messages :deep(.msg-row--compact .msg-body--analysis) {
  max-width: 100%;
}

.assistant-drawer__messages :deep(.msg-row--compact .bubble--analysis::before) {
  height: 2px;
}

.assistant-drawer__messages :deep(.msg-row--compact .analysis-reply-header) {
  padding: var(--dw-space-3) var(--dw-space-4);
  gap: var(--dw-space-3);
}

.assistant-drawer__messages :deep(.msg-row--compact .analysis-reply-badge) {
  font-size: var(--dw-text-sm);
}

.assistant-drawer__messages :deep(.msg-row--compact .analysis-reply-body) {
  gap: var(--dw-space-4);
  padding: var(--dw-space-4);
}

.assistant-drawer__messages :deep(.msg-row--compact .analysis-summary) {
  padding: var(--dw-space-3) var(--dw-space-4);
}

.assistant-drawer__messages :deep(.msg-row--compact .ai-analysis-panel) {
  gap: var(--dw-space-3);
}

.assistant-drawer__messages :deep(.msg-row--compact .analysis-export-bar) {
  display: none;
}

.assistant-drawer__messages :deep(.msg-row--compact .ai-section-card__head) {
  padding: var(--dw-space-2) var(--dw-space-3);
}

.assistant-drawer__messages :deep(.msg-row--compact .analysis-sql-body pre) {
  padding: var(--dw-space-3);
  max-height: 160px;
  overflow: auto;
  font-size: var(--dw-text-xs);
}

.assistant-drawer__messages :deep(.msg-row--compact .ai-analysis-chart .echarts-panel) {
  height: 180px;
}

.assistant-drawer__messages :deep(.msg-row--compact .analysis-table-scroll) {
  max-height: 180px;
  overflow: auto;
}

.assistant-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: var(--dw-space-8) var(--dw-space-2) var(--dw-space-6);
  text-align: center;
}

.assistant-empty__mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-bottom: 2px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--dw-bg-panel) 70%, transparent);
  color: var(--dw-text-secondary);
  border: 1px solid color-mix(in srgb, var(--dw-border) 70%, transparent);
}

.assistant-empty__title {
  margin: 0;
  max-width: 16em;
  font-size: var(--dw-text-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.35;
  color: var(--dw-text);
}

.assistant-empty__hint {
  margin: 0;
  max-width: 22em;
  font-size: var(--dw-text-xs);
  line-height: 1.55;
  color: var(--dw-text-secondary);
}

.assistant-empty__link {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-1);
  margin-top: var(--dw-space-2);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
  transition: color 0.12s ease;
}

.assistant-empty__link:hover {
  color: var(--dw-text);
}

.assistant-drawer__composer {
  flex-shrink: 0;
  margin-top: auto;
  padding: var(--dw-space-3) var(--dw-space-3) var(--dw-space-2);
  border-top: 1px solid color-mix(in srgb, var(--dw-border) 70%, transparent);
  background: color-mix(in srgb, var(--dw-bg) 55%, var(--dw-bg-panel));
}

/* AiChatComposer defaults are for full Agent page — tighten for the rail */
.assistant-drawer__composer :deep(.composer-wrap) {
  padding: 0;
}

.assistant-drawer__composer :deep(.composer-card) {
  padding: var(--dw-space-3) var(--dw-space-3) var(--dw-space-2);
  border-color: color-mix(in srgb, var(--dw-border) 75%, transparent);
  background: color-mix(in srgb, var(--dw-bg) 70%, transparent);
  box-shadow: none;
  border-radius: var(--dw-control-radius);
}

.assistant-drawer__composer :deep(.composer-targets) {
  margin-bottom: var(--dw-space-2);
  gap: var(--dw-space-1);
}

.assistant-drawer__quota {
  margin: 0 0 var(--dw-space-2);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
}
</style>
