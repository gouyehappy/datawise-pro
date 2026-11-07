<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {AppModal} from '@datawise/overlays'
import {DwIcon} from '@datawise/icons'
import {IconButton} from '@datawise/ui'
import {useCodeClipboard} from '../clipboard'
import {useCodeI18n} from '../code-i18n'
import {useContentFind} from '../useContentFind'
import DwFindBar from './DwFindBar.vue'
import '../styles/content-viewer-modal.css'

type LogLevel = 'error' | 'warn' | 'info' | 'success' | 'plain'

const props = withDefaults(
  defineProps<{
    /** Raw log text (unfiltered). */
    content: string
    title: string
    subtitle?: string
    loading?: boolean
    /** Show live badge when streaming/polling. */
    live?: boolean
    liveLabel?: string
    /** Auto-scroll to bottom when content grows. */
    follow?: boolean
    emptyText?: string
    /** Optional card chrome (border/padding) around the viewer. */
    card?: boolean
    showFollowToggle?: boolean
    /** Match DwCodeViewer dark chrome (default true). */
    dark?: boolean
  }>(),
  {
    content: '',
    loading: false,
    live: false,
    follow: true,
    card: false,
    showFollowToggle: true,
    dark: true,
  },
)

const emit = defineEmits<{
  'update:follow': [value: boolean]
  copied: [ok: boolean]
}>()

const t = useCodeI18n()
const clipboard = useCodeClipboard()

const findOpen = ref(false)
const findQuery = ref('')
const expanded = ref(false)
const panelEl = ref<HTMLElement | null>(null)
const modalEl = ref<HTMLElement | null>(null)

const hasContent = computed(() => Boolean(props.content?.trim()))

const sourceLines = computed(() => {
  const raw = props.content ?? ''
  if (!raw) return [] as string[]
  return raw.split('\n')
})

const {
  matchIndexes,
  matchCount,
  matchState,
  resultIndex,
  activeSourceIndex,
  findNext,
  findPrevious,
  reset: resetFind,
} = useContentFind({
  lines: sourceLines,
  query: findQuery,
})

const findActive = computed(() => Boolean(findQuery.value.trim()))

const showEmptyFind = computed(
  () => findActive.value && matchCount.value === 0 && hasContent.value,
)

function classifyLine(line: string): LogLevel {
  const upper = line.toUpperCase()
  if (/\b(ERROR|FATAL|FAILURE|FAILED)\b/.test(upper) || /Finished:\s*FAILURE/i.test(line)) {
    return 'error'
  }
  if (/\bWARN(ING)?\b/.test(upper) || /Finished:\s*UNSTABLE/i.test(line) || /\bUNSTABLE\b/.test(upper)) {
    return 'warn'
  }
  if (/Finished:\s*SUCCESS/i.test(line) || /\bSUCCESS\b/.test(upper)) {
    return 'success'
  }
  if (/\b(INFO|BUILDING)\b/.test(upper)) {
    return 'info'
  }
  return 'plain'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightNeedle(text: string, needle: string, activeLine: boolean): string {
  const raw = text || ' '
  if (!needle) return escapeHtml(raw)
  const lower = raw.toLowerCase()
  const n = needle.toLowerCase()
  let out = ''
  let start = 0
  let idx = lower.indexOf(n, start)
  while (idx !== -1) {
    out += escapeHtml(raw.slice(start, idx))
    out +=
      `<mark class="dw-log-viewer__mark${activeLine ? ' is-active' : ''}">` +
      `${escapeHtml(raw.slice(idx, idx + needle.length))}</mark>`
    start = idx + needle.length
    idx = lower.indexOf(n, start)
  }
  out += escapeHtml(raw.slice(start))
  return out || escapeHtml(' ')
}

const highlightedHtml = computed(() => {
  if (!hasContent.value || showEmptyFind.value) return ''
  const lines = sourceLines.value
  const needle = findQuery.value.trim()
  const indexes = needle ? matchIndexes.value : lines.map((_, index) => index)
  const activeLine = activeSourceIndex.value
  const parts: string[] = new Array(indexes.length)
  for (let i = 0; i < indexes.length; i++) {
    const sourceIndex = indexes[i]!
    const text = lines[sourceIndex] ?? ''
    const level = classifyLine(text)
    const active = needle.length > 0 && sourceIndex === activeLine
    const safe = highlightNeedle(text, needle, active)
    parts[i] =
      `<div class="dw-log-viewer__line is-${level}${active ? ' is-find-active' : ''}" data-find-line="${sourceIndex}">` +
      `<span class="dw-log-viewer__gutter">${sourceIndex + 1}</span>` +
      `<span class="dw-log-viewer__line-text">${safe}</span>` +
      `</div>`
  }
  return parts.join('')
})

const resolvedLiveLabel = computed(
  () => props.liveLabel?.trim() || t('common.logViewer.live'),
)

async function scrollToBottom() {
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  for (const el of [panelEl.value, modalEl.value]) {
    if (!el) continue
    el.scrollTop = el.scrollHeight
  }
}

async function scrollToTop() {
  await nextTick()
  for (const el of [panelEl.value, modalEl.value]) {
    if (!el) continue
    el.scrollTop = 0
  }
}

async function scrollActiveMatchIntoView() {
  const line = activeSourceIndex.value
  if (line < 0) return
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  for (const root of [panelEl.value, modalEl.value]) {
    const target = root?.querySelector<HTMLElement>(`[data-find-line="${line}"]`)
    target?.scrollIntoView({block: 'nearest'})
  }
}

function jumpBottom() {
  emit('update:follow', true)
  void scrollToBottom()
}

function jumpTop() {
  emit('update:follow', false)
  void scrollToTop()
}

async function copyLog() {
  const text = props.content?.trim()
  if (!text) return
  const ok = await clipboard.writeText(text)
  emit('copied', ok)
}

function openFullscreen() {
  expanded.value = true
  void scrollToBottom()
}

function closeFullscreen() {
  expanded.value = false
}

function toggleFollow() {
  setFollow(!props.follow)
}

function setFollow(value: boolean) {
  emit('update:follow', value)
  if (value) void scrollToBottom()
}

function openFind() {
  findOpen.value = true
}

function closeFind() {
  findOpen.value = false
  findQuery.value = ''
  resetFind()
}

function toggleFind() {
  if (findOpen.value) closeFind()
  else openFind()
}

function onFindNext() {
  if (!findQuery.value.trim()) return
  emit('update:follow', false)
  findNext()
  void scrollActiveMatchIntoView()
}

function onFindPrevious() {
  if (!findQuery.value.trim()) return
  emit('update:follow', false)
  findPrevious()
  void scrollActiveMatchIntoView()
}

function onViewerKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey
  if (mod && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    event.stopPropagation()
    openFind()
  }
}

watch(
  () => props.content,
  async (next, prev) => {
    if (!props.follow) return
    if (next === prev) return
    if (findOpen.value && findQuery.value.trim()) return
    await scrollToBottom()
  },
)

watch(expanded, (open) => {
  if (open && props.follow && !(findOpen.value && findQuery.value.trim())) {
    void scrollToBottom()
  }
})

watch(findOpen, (open) => {
  if (open) return
  findQuery.value = ''
  resetFind()
})

watch(findQuery, () => {
  if (!findQuery.value.trim()) return
  emit('update:follow', false)
  void scrollActiveMatchIntoView()
})

defineExpose({
  scrollToBottom,
  scrollToTop,
  openFullscreen,
  closeFullscreen,
  openFind,
  closeFind,
})
</script>

<template>
  <section
      class="dw-log-viewer"
      :class="{
        'dw-log-viewer--card': card,
        'dw-log-viewer--dark': dark,
      }"
      @keydown="onViewerKeydown"
  >
    <header class="dw-log-viewer__head">
      <div class="dw-log-viewer__titles">
        <h4 class="dw-log-viewer__title">{{ title }}</h4>
        <span
            v-if="live"
            class="dw-log-viewer__live-pill"
            :title="resolvedLiveLabel"
        >{{ t('common.logViewer.liveShort') }}</span>
        <span v-if="subtitle" class="dw-log-viewer__subtitle" :title="subtitle">{{ subtitle }}</span>
      </div>
      <div class="dw-log-viewer__actions">
        <slot name="actions"/>
        <IconButton
            size="sm"
            class="dw-log-viewer__icon-btn"
            :class="{ 'is-active': findOpen }"
            :title="t('common.logViewer.find')"
            :active="findOpen"
            @click="toggleFind"
        >
          <DwIcon name="search" size="sm"/>
        </IconButton>
        <span class="dw-log-viewer__tool-sep" aria-hidden="true"/>
        <IconButton
            v-if="showFollowToggle"
            size="sm"
            class="dw-log-viewer__icon-btn"
            :class="{ 'is-follow-on': follow }"
            :title="t('common.logViewer.follow')"
            :active="follow"
            @click="toggleFollow"
        >
          <DwIcon name="pin" size="sm"/>
        </IconButton>
        <IconButton
            size="sm"
            class="dw-log-viewer__icon-btn"
            :title="t('common.logViewer.jumpTop')"
            :disabled="!hasContent"
            @click="jumpTop"
        >
          <DwIcon name="arrow-up" size="sm"/>
        </IconButton>
        <IconButton
            size="sm"
            class="dw-log-viewer__icon-btn"
            :title="t('common.logViewer.jumpBottom')"
            :disabled="!hasContent"
            @click="jumpBottom"
        >
          <DwIcon name="arrow-down" size="sm"/>
        </IconButton>
        <IconButton
            size="sm"
            class="dw-log-viewer__icon-btn"
            :title="t('common.logViewer.copy')"
            :disabled="!hasContent"
            @click="copyLog"
        >
          <DwIcon name="copy" size="sm"/>
        </IconButton>
        <IconButton
            size="sm"
            class="dw-log-viewer__icon-btn"
            :title="t('common.logViewer.openFullscreen')"
            @click="openFullscreen"
        >
          <DwIcon name="fullscreen" size="sm"/>
        </IconButton>
      </div>
    </header>

    <div class="dw-log-viewer__body">
      <DwFindBar
          v-model="findQuery"
          v-model:open="findOpen"
          :result-index="resultIndex"
          :result-count="matchCount"
          :match-state="matchState"
          :dark="dark"
          :aria-label="t('common.logViewer.find')"
          @find-next="onFindNext"
          @find-previous="onFindPrevious"
          @close="closeFind"
      />
      <p v-if="loading && !hasContent" class="dw-log-viewer__loading">
        {{ t('common.logViewer.loading') }}
      </p>
      <div
          v-else-if="!hasContent"
          class="dw-log-viewer__text"
      >
        <div class="dw-log-viewer__empty">{{ emptyText ?? '—' }}</div>
      </div>
      <div
          v-else-if="showEmptyFind"
          class="dw-log-viewer__text"
      >
        <div class="dw-log-viewer__empty">{{ t('common.logViewer.findEmpty') }}</div>
      </div>
      <div
          v-else
          ref="panelEl"
          class="dw-log-viewer__text"
          role="log"
          aria-live="polite"
          v-html="highlightedHtml"
      />
    </div>
  </section>

  <AppModal
      :open="expanded"
      :title="title"
      :subtitle="subtitle"
      width="min(1280px, 98vw)"
      max-height="min(94vh, 980px)"
      close-on-backdrop
      auto-focus="close"
      @close="closeFullscreen"
  >
    <template #header-actions>
      <span
          v-if="live"
          class="dw-log-viewer__live-pill"
          :title="resolvedLiveLabel"
      >{{ t('common.logViewer.liveShort') }}</span>
      <div class="dw-log-viewer__actions">
        <IconButton
            size="sm"
            class="dw-log-viewer__icon-btn"
            :class="{ 'is-active': findOpen }"
            :title="t('common.logViewer.find')"
            :active="findOpen"
            @click="toggleFind"
        >
          <DwIcon name="search" size="sm"/>
        </IconButton>
        <span class="dw-log-viewer__tool-sep" aria-hidden="true"/>
        <IconButton
            v-if="showFollowToggle"
            size="sm"
            class="dw-log-viewer__icon-btn"
            :class="{ 'is-follow-on': follow }"
            :title="t('common.logViewer.follow')"
            :active="follow"
            @click="toggleFollow"
        >
          <DwIcon name="pin" size="sm"/>
        </IconButton>
        <IconButton
            size="sm"
            class="dw-log-viewer__icon-btn"
            :title="t('common.logViewer.jumpTop')"
            :disabled="!hasContent"
            @click="jumpTop"
        >
          <DwIcon name="arrow-up" size="sm"/>
        </IconButton>
        <IconButton
            size="sm"
            class="dw-log-viewer__icon-btn"
            :title="t('common.logViewer.jumpBottom')"
            :disabled="!hasContent"
            @click="jumpBottom"
        >
          <DwIcon name="arrow-down" size="sm"/>
        </IconButton>
        <IconButton
            size="sm"
            class="dw-log-viewer__icon-btn"
            :title="t('common.logViewer.copy')"
            :disabled="!hasContent"
            @click="copyLog"
        >
          <DwIcon name="copy" size="sm"/>
        </IconButton>
      </div>
    </template>

    <div
        class="dw-log-viewer__modal dw-content-viewer-modal"
        :class="{ 'dw-log-viewer__modal--dark': dark }"
        @keydown="onViewerKeydown"
    >
      <DwFindBar
          v-model="findQuery"
          v-model:open="findOpen"
          :result-index="resultIndex"
          :result-count="matchCount"
          :match-state="matchState"
          :dark="dark"
          :aria-label="t('common.logViewer.find')"
          @find-next="onFindNext"
          @find-previous="onFindPrevious"
          @close="closeFind"
      />
      <div
          v-if="!hasContent"
          class="dw-log-viewer__text dw-log-viewer__text--modal dw-content-viewer-modal__surface"
      >
        <div class="dw-log-viewer__empty">{{ emptyText ?? '—' }}</div>
      </div>
      <div
          v-else-if="showEmptyFind"
          class="dw-log-viewer__text dw-log-viewer__text--modal dw-content-viewer-modal__surface"
      >
        <div class="dw-log-viewer__empty">{{ t('common.logViewer.findEmpty') }}</div>
      </div>
      <div
          v-else
          ref="modalEl"
          class="dw-log-viewer__text dw-log-viewer__text--modal dw-content-viewer-modal__surface"
          role="log"
          v-html="highlightedHtml"
      />
    </div>
  </AppModal>
</template>

<style scoped>
.dw-log-viewer {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.dw-log-viewer--card {
  padding: 0;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  overflow: hidden;
}

.dw-log-viewer--dark.dw-log-viewer--card {
  border-color: var(--dw-terminal-border);
  background: var(--dw-terminal-bg);
}

.dw-log-viewer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
  min-height: 38px;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-on-accent) 8%, transparent);
  background: var(--dw-terminal-bg);
}

.dw-log-viewer:not(.dw-log-viewer--dark) .dw-log-viewer__head {
  border-bottom-color: var(--dw-border-light);
  background: var(--dw-bg-panel);
}

.dw-log-viewer__titles {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.dw-log-viewer__title {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 650;
  letter-spacing: 0.01em;
  color: var(--dw-text);
  white-space: nowrap;
  flex-shrink: 0;
}

.dw-log-viewer--dark .dw-log-viewer__title {
  color: color-mix(in srgb, var(--dw-on-accent) 90%, var(--dw-terminal-fg));
}

.dw-log-viewer__subtitle {
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.dw-log-viewer__live-pill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: var(--dw-radius-pill);
  font-size: var(--dw-font-size-badge);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--dw-success) 55%, var(--dw-on-accent));
  background: var(--dw-success-soft);
  border: 1px solid color-mix(in srgb, var(--dw-success) 40%, transparent);
  flex-shrink: 0;
  white-space: nowrap;
}

.dw-log-viewer__actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 0;
}

.dw-log-viewer__tool-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: color-mix(in srgb, var(--dw-on-accent) 22%, transparent);
  flex-shrink: 0;
}

.dw-log-viewer__body {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dw-log-viewer__icon-btn {
  color: var(--dw-terminal-fg);
  border-radius: 6px;
}

.dw-log-viewer__icon-btn:hover:not(:disabled) {
  color: var(--dw-on-accent);
  background: color-mix(in srgb, var(--dw-on-accent) 10%, transparent);
}

.dw-log-viewer__icon-btn.is-follow-on,
.dw-log-viewer__icon-btn.is-active {
  color: color-mix(in srgb, var(--dw-info) 55%, var(--dw-on-accent));
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-info) 45%, transparent);
}

.dw-log-viewer:not(.dw-log-viewer--dark) .dw-log-viewer__icon-btn {
  color: var(--dw-text-secondary);
}

.dw-log-viewer:not(.dw-log-viewer--dark) .dw-log-viewer__icon-btn:hover:not(:disabled) {
  color: var(--dw-text);
  background: var(--dw-surface-hover, rgba(0, 0, 0, 0.04));
}

.dw-log-viewer__loading,
.dw-log-viewer__empty {
  margin: 0;
  padding: 18px 14px;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.dw-log-viewer__text {
  margin: 0;
  flex: 1;
  min-height: 160px;
  overflow: auto;
  padding: 6px 0;
  border-radius: 0;
  background: var(--dw-terminal-bg);
  color: var(--dw-terminal-fg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Cascadia Code', monospace;
  font-size: var(--dw-text-sm);
  line-height: 1.55;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--dw-scrollbar-thumb) transparent;
}

.dw-log-viewer__text :deep(.dw-log-viewer__line) {
  display: grid;
  grid-template-columns: 3.25rem minmax(0, 1fr);
  gap: 0;
  min-height: 1.55em;
  padding: 0 10px 0 0;
}

.dw-log-viewer__text :deep(.dw-log-viewer__line:hover) {
  background: color-mix(in srgb, var(--dw-primary) 7%, transparent);
}

.dw-log-viewer__text :deep(.dw-log-viewer__line.is-find-active) {
  background: color-mix(in srgb, var(--dw-primary) 16%, transparent);
  box-shadow: inset 2px 0 0 var(--dw-primary);
}

.dw-log-viewer__text :deep(.dw-log-viewer__gutter) {
  user-select: none;
  text-align: right;
  padding: 0 10px 0 8px;
  color: color-mix(in srgb, var(--dw-terminal-fg) 38%, transparent);
  border-right: 1px solid var(--dw-terminal-border);
  font-variant-numeric: tabular-nums;
}

.dw-log-viewer__text :deep(.dw-log-viewer__line-text) {
  padding: 0 0 0 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dw-terminal-fg);
}

.dw-log-viewer__text :deep(.dw-log-viewer__mark) {
  padding: 0 1px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--dw-warning) 45%, transparent);
  color: inherit;
}

.dw-log-viewer__text :deep(.dw-log-viewer__mark.is-active) {
  background: color-mix(in srgb, var(--dw-primary) 55%, var(--dw-warning));
  color: var(--dw-on-accent, #fff);
}

.dw-log-viewer__text :deep(.dw-log-viewer__line.is-error .dw-log-viewer__line-text) {
  color: color-mix(in srgb, var(--dw-danger) 55%, var(--dw-on-accent));
}

.dw-log-viewer__text :deep(.dw-log-viewer__line.is-error) {
  background: var(--dw-danger-soft);
}

.dw-log-viewer__text :deep(.dw-log-viewer__line.is-warn .dw-log-viewer__line-text) {
  color: color-mix(in srgb, var(--dw-warning) 65%, var(--dw-on-accent));
}

.dw-log-viewer__text :deep(.dw-log-viewer__line.is-warn) {
  background: var(--dw-warning-soft);
}

.dw-log-viewer__text :deep(.dw-log-viewer__line.is-info .dw-log-viewer__line-text) {
  color: color-mix(in srgb, var(--dw-info) 55%, var(--dw-on-accent));
}

.dw-log-viewer__text :deep(.dw-log-viewer__line.is-success .dw-log-viewer__line-text) {
  color: color-mix(in srgb, var(--dw-success) 55%, var(--dw-on-accent));
  font-weight: 600;
}

.dw-log-viewer__modal {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--dw-terminal-bg);
  box-shadow: none;
}

.dw-log-viewer__text--modal {
  flex: 1;
  min-height: 0;
  height: 100%;
  margin: 0;
  border-radius: 0;
}
</style>
