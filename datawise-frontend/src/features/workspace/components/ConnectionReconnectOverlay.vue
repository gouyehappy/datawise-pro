<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {formatBindingParts} from '@/core/shortcuts/shortcut.service'
import {DwIcon} from '@/core/icons'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
import type {DbType} from '@/core/types'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {formatWelcomeConnectionSubtitle} from '@/features/workspace/services/welcome-connection-subtitle.service'

const props = defineProps<{
  connectionId: string
  connectionName?: string
  dbType?: DbType
}>()

const {t} = useI18n()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()
const reconnecting = ref(false)
const subtitle = ref('')

const displayName = computed(() => props.connectionName?.trim() || props.connectionId)
const resolvedDbType = computed(() => {
  return props.dbType
    || explorer.findNode(props.connectionId)?.dbType
    || undefined
})

const closeKbdParts = computed(() => formatBindingParts('Ctrl+W'))
/** Match SSH restore card: Enter shown as return glyph. */
const connectKbdParts = computed(() => ['↵'])

async function loadSubtitle() {
  const config = await fetchConnectionConfig(props.connectionId)
  subtitle.value = formatWelcomeConnectionSubtitle(config, resolvedDbType.value) || ''
}

async function onReconnect() {
  if (reconnecting.value) return
  reconnecting.value = true
  try {
    // 成功后叠加层会消失，树状态也会更新，无需再弹 toast。
    await explorer.connectConnection(props.connectionId, {notify: true})
  } finally {
    reconnecting.value = false
  }
}

function onClose() {
  if (reconnecting.value) return
  const tab = workspace.activeTab
  if (!tab) return
  if (tab.connectionId && tab.connectionId !== props.connectionId) return
  workspace.closeTab(tab.id)
}

function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return
  if (reconnecting.value) return

  const key = event.key
  if (key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    event.stopPropagation()
    void onReconnect()
    return
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key.toLowerCase() === 'w') {
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }
}

onMounted(() => {
  void loadSubtitle()
  window.addEventListener('keydown', onKeydown, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
watch(() => props.connectionId, () => {
  void loadSubtitle()
})
</script>

<template>
  <div
      class="connection-reconnect-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="t('explorer.connectionNeedsReconnectTitle')"
  >
    <div class="connection-reconnect-overlay__panel">
      <section class="connection-reconnect-overlay__hero">
        <header class="connection-reconnect-overlay__identity">
          <span class="connection-reconnect-overlay__badge" aria-hidden="true">
            <DbTypeIcon
                v-if="resolvedDbType"
                :db-type="resolvedDbType"
                :size="DB_TYPE_ICON_SIZE.list"
            />
            <DwIcon v-else name="database" size="md" :stroke-width="1.6"/>
          </span>
          <div class="connection-reconnect-overlay__heading">
            <strong class="connection-reconnect-overlay__name" :title="displayName">
              {{ displayName }}
            </strong>
            <span
                v-if="subtitle"
                class="connection-reconnect-overlay__endpoint"
                :title="subtitle"
            >
              {{ subtitle }}
            </span>
          </div>
        </header>

        <div class="connection-reconnect-overlay__copy">
          <p class="connection-reconnect-overlay__title">
            {{ t('explorer.connectionNeedsReconnectTitle') }}
          </p>
          <p class="connection-reconnect-overlay__hint">
            {{ t('explorer.connectionNeedsReconnectHint') }}
          </p>
        </div>
      </section>

      <div class="connection-reconnect-overlay__actions">
        <div class="connection-reconnect-overlay__action">
          <button
              type="button"
              class="connection-reconnect-overlay__btn connection-reconnect-overlay__btn--ghost"
              :disabled="reconnecting"
              @click="onClose"
          >
            {{ t('common.close') }}
          </button>
          <span class="connection-reconnect-overlay__kbd-row" aria-hidden="true">
            <kbd
                v-for="(part, index) in closeKbdParts"
                :key="`close-${index}-${part}`"
            >{{ part }}</kbd>
          </span>
        </div>
        <div class="connection-reconnect-overlay__action">
          <button
              type="button"
              class="connection-reconnect-overlay__btn connection-reconnect-overlay__btn--primary"
              :disabled="reconnecting"
              @click="onReconnect"
          >
            <DwIcon
                v-if="reconnecting"
                class="connection-reconnect-overlay__spin"
                name="refresh"
                size="sm"
                :stroke-width="2"
            />
            {{ reconnecting
              ? t('explorer.connectionNeedsReconnectLoading')
              : t('explorer.connectionNeedsReconnectAction') }}
          </button>
          <span class="connection-reconnect-overlay__kbd-row" aria-hidden="true">
            <kbd
                v-for="(part, index) in connectKbdParts"
                :key="`connect-${index}-${part}`"
            >{{ part }}</kbd>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.connection-reconnect-overlay {
  position: absolute;
  inset: 0;
  z-index: var(--dw-z-toolbar);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1.5rem, 5vh, 3.5rem) 1.5rem;
  box-sizing: border-box;
  background: var(--dw-bg-editor, var(--dw-bg));
  color: var(--dw-text);
  pointer-events: auto;
}

.connection-reconnect-overlay__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.25rem;
  width: max-content;
  max-width: min(100%, 40rem);
  text-align: center;
  animation: connection-reconnect-in 220ms var(--dw-ease, ease-out) both;
}

/* Identity + status as one vertical composition (SSH restore rhythm). */
.connection-reconnect-overlay__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.connection-reconnect-overlay__identity {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 100%;
}

.connection-reconnect-overlay__badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.65rem;
  border: 1px solid color-mix(in srgb, var(--dw-border) 72%, transparent);
  background: color-mix(in srgb, var(--dw-text) 5%, var(--dw-bg-muted, var(--dw-bg)));
  color: var(--dw-text-secondary);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.connection-reconnect-overlay__heading {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  min-width: 0;
  text-align: left;
}

.connection-reconnect-overlay__name {
  max-width: min(28rem, 72vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  line-height: 1.25;
  color: var(--dw-text);
}

.connection-reconnect-overlay__endpoint {
  max-width: min(28rem, 72vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  line-height: 1.35;
  color: color-mix(in srgb, var(--dw-text-secondary) 90%, transparent);
  font-variant-numeric: tabular-nums;
}

.connection-reconnect-overlay__copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
}

.connection-reconnect-overlay__title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 650;
  letter-spacing: 0.02em;
  line-height: 1.15;
  color: var(--dw-text);
}

.connection-reconnect-overlay__hint {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: color-mix(in srgb, var(--dw-text-secondary) 86%, transparent);
  white-space: nowrap;
}

.connection-reconnect-overlay__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem 0.75rem;
  width: 17.5rem;
}

.connection-reconnect-overlay__action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.connection-reconnect-overlay__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  width: 100%;
  height: 2.25rem;
  padding: 0 0.875rem;
  border-radius: 0.45rem;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
      background 140ms var(--dw-ease, ease),
      border-color 140ms var(--dw-ease, ease),
      color 140ms var(--dw-ease, ease),
      box-shadow 140ms var(--dw-ease, ease),
      transform 140ms var(--dw-ease, ease),
      opacity 140ms var(--dw-ease, ease);
}

.connection-reconnect-overlay__btn--ghost {
  border: 1px solid color-mix(in srgb, var(--dw-border) 85%, var(--dw-text));
  background: color-mix(in srgb, var(--dw-text) 5.5%, var(--dw-bg-editor, var(--dw-bg)));
  color: var(--dw-text);
}

.connection-reconnect-overlay__btn--ghost:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dw-text) 9%, var(--dw-bg-editor, var(--dw-bg)));
  border-color: color-mix(in srgb, var(--dw-border) 65%, var(--dw-text));
}

.connection-reconnect-overlay__btn--primary {
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--dw-text) 94%, #fff);
  color: color-mix(in srgb, var(--dw-bg) 82%, #000);
  box-shadow: 0 1px 0 color-mix(in srgb, #fff 28%, transparent) inset;
}

.connection-reconnect-overlay__btn--primary:hover:not(:disabled) {
  background: #fff;
  color: #0a0a0a;
}

.connection-reconnect-overlay__btn:focus-visible {
  outline: none;
  box-shadow: var(--dw-focus-ring);
}

.connection-reconnect-overlay__btn:disabled {
  opacity: 0.72;
  cursor: default;
}

.connection-reconnect-overlay__kbd-row {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  min-height: 1.2rem;
}

.connection-reconnect-overlay__kbd-row kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.3rem;
  height: 1.3rem;
  padding: 0 0.3rem;
  border: 1px solid color-mix(in srgb, var(--dw-border) 70%, transparent);
  border-bottom-width: 2px;
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--dw-text) 4%, var(--dw-bg-editor, var(--dw-bg)));
  color: color-mix(in srgb, var(--dw-text-secondary) 88%, transparent);
  font: 600 0.625rem/1 ui-sans-serif, system-ui, sans-serif;
}

.connection-reconnect-overlay__spin {
  animation: connection-reconnect-spin 0.75s linear infinite;
}

@keyframes connection-reconnect-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes connection-reconnect-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .connection-reconnect-overlay__panel {
    animation: none;
  }
}
</style>
