<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import ToolWindowShell from '@/features/layout/components/ToolWindowShell.vue'
import {IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {DwIconName} from '@/core/icons'
import type {AppNotification, NotificationCategory} from '@/core/types'
import {
  categoryAccent,
  categorySoftBg,
  formatNotificationTime,
  resolveSlowQueryDetails,
} from '@/features/layout/services/notification.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useNotificationStore} from '@/features/layout/stores/notification-store'
import {usePanelHeaderDrag} from '@/features/dock/composables/usePanelHeaderDrag'

const props = withDefaults(
    defineProps<{
      /** 嵌在右侧 ShortcutRail 旁，挤开工作区 */
      embedded?: boolean
      /** Allow dragging the whole shortcut rail via this drawer header. */
      headerDraggable?: boolean
    }>(),
    {embedded: false, headerDraggable: false},
)

const {t} = useI18n()
const layout = useLayoutStore()
const notifications = useNotificationStore()
const {onPointerDown: onDockHeaderPointerDown} = usePanelHeaderDrag('shortcut')

const now = ref(Date.now())
const menuOpen = ref(false)
const menuRef = ref<HTMLElement>()
const expandedSqlIds = ref(new Set<string>())

function toggleSqlExpand(id: string) {
  const next = new Set(expandedSqlIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedSqlIds.value = next
}

function isSqlExpanded(id: string) {
  return expandedSqlIds.value.has(id)
}

usePopoverEscape(menuOpen, () => {
  menuOpen.value = false
}, {
  containRefs: () => [menuRef.value],
})

const hasRead = computed(() => notifications.items.some((item) => item.read))
const isEmpty = computed(() => notifications.items.length === 0)

const headerSubtitle = computed(() => {
  if (isEmpty.value) return undefined
  const count = notifications.unreadCount
  if (count > 0) return t('notification.unread', {count})
  return undefined
})

const categoryOrder: NotificationCategory[] = ['system', 'export', 'workspace', 'info']

const groupedSections = computed(() => {
  const buckets = new Map<NotificationCategory, AppNotification[]>()
  for (const item of notifications.items) {
    const list = buckets.get(item.category) ?? []
    list.push(item)
    buckets.set(item.category, list)
  }
  return categoryOrder
      .filter((category) => buckets.has(category))
      .map((category) => ({
        category,
        label: t(`notification.groups.${category}`),
        items: buckets.get(category)!.map((item) => ({
          item,
          slowQuery: resolveSlowQueryDetails(item),
        })),
      }))
})

function titleOf(item: AppNotification) {
  return t(`notification.messages.${item.titleKey}.title`, item.params ?? {})
}

function bodyOf(item: AppNotification) {
  return t(`notification.messages.${item.bodyKey}.body`, item.params ?? {})
}

function timeOf(item: AppNotification) {
  return formatNotificationTime(item.createdAt, now.value, t)
}

function onOpen() {
  now.value = Date.now()
}

watch(
    () => layout.showNotificationDrawer,
    (open) => {
      if (open) onOpen()
      else {
        menuOpen.value = false
        expandedSqlIds.value = new Set()
      }
    },
)

function closePanel() {
  layout.showNotificationDrawer = false
}

/** AUDIT-02: Escape closes the tool window (menu Escape wins while open). */
usePopoverEscape(
    () => layout.showNotificationDrawer && !menuOpen.value,
    closePanel,
)

function dismiss(item: AppNotification) {
  notifications.remove(item.id)
}

function gotIt(item: AppNotification) {
  notifications.markRead(item.id)
}

function openSettings() {
  layout.setModule('settings')
  closePanel()
}

function primaryAction(item: AppNotification) {
  if (item.titleKey.startsWith('system')) {
    openSettings()
    notifications.markRead(item.id)
    return
  }
  gotIt(item)
}

function primaryLabel(item: AppNotification) {
  if (item.titleKey.startsWith('system')) return t('notification.actions.openSettings')
  return t('notification.actions.gotIt')
}

function showPrimaryAction(item: AppNotification) {
  return item.titleKey.startsWith('system') || item.category === 'info'
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function runMenuAction(action: () => void) {
  action()
  menuOpen.value = false
}

function notificationIcon(category: NotificationCategory, titleKey: string): DwIconName {
  if (titleKey === 'alertSlowQuery') return 'monitor'
  if (titleKey === 'alertConnectionHealth') return 'alert-circle'
  switch (category) {
    case 'export':
      return 'export'
    case 'system':
      return 'audit'
    default:
      return 'alert-circle'
  }
}
</script>

<template>
  <div
      v-if="layout.showNotificationDrawer"
      class="tool-window-host"
      :class="{ 'tool-window--standalone': !embedded }"
  >
    <ToolWindowShell
        :title="t('notification.title')"
        :subtitle="headerSubtitle"
        :header-draggable="headerDraggable"
        dock-panel="shortcut"
        @collapse="closePanel"
        @header-pointerdown="onDockHeaderPointerDown"
    >
      <template #head-actions>
        <div ref="menuRef" class="tool-window__menu">
          <IconButton
              size="sm"
              :title="t('notification.menu.more')"
              :aria-expanded="menuOpen"
              @click="toggleMenu"
          >
            ⋮
          </IconButton>
          <div v-if="menuOpen" class="tool-window__dropdown">
            <button
                type="button"
                :disabled="!notifications.unreadCount"
                @click="runMenuAction(() => notifications.markAllRead())"
            >
              {{ t('notification.markAllRead') }}
            </button>
            <button
                type="button"
                :disabled="!hasRead"
                @click="runMenuAction(() => notifications.clearRead())"
            >
              {{ t('notification.clearRead') }}
            </button>
            <button
                type="button"
                :disabled="isEmpty"
                class="is-danger"
                @click="runMenuAction(() => notifications.clearAll())"
            >
              {{ t('notification.clearAll') }}
            </button>
          </div>
        </div>
      </template>

      <div class="notify-body">
        <div v-if="isEmpty" class="notify-empty">
          <div class="notify-empty__icon" aria-hidden="true">
            <DwIcon name="notify" size="lg" :stroke-width="1.5"/>
          </div>
          <p class="notify-empty__title">{{ t('notification.empty') }}</p>
          <span class="notify-empty__hint">{{ t('notification.emptyHint') }}</span>
        </div>

        <section
            v-for="section in groupedSections"
            :key="section.category"
            class="notify-section"
        >
          <div class="notify-section__head">
            <span
                class="notify-section__pill"
                :style="{
                  '--section-accent': categoryAccent(section.category),
                  '--section-soft': categorySoftBg(section.category),
                }"
            >
              {{ section.label }}
            </span>
            <span class="notify-section__count">{{ section.items.length }}</span>
          </div>

          <article
              v-for="{ item, slowQuery } in section.items"
              :key="item.id"
              class="notify-card"
              :class="{ 'is-unread': !item.read }"
              :style="{
                '--card-accent': categoryAccent(item.category),
                '--card-soft': categorySoftBg(item.category),
              }"
          >
            <div class="notify-card__icon" aria-hidden="true">
              <DwIcon :name="notificationIcon(item.category, item.titleKey)" size="xs" filled/>
            </div>

            <div class="notify-card__main">
              <div class="notify-card__top">
                <h5 class="notify-card__title">{{ titleOf(item) }}</h5>
                <span v-if="!item.read" class="notify-card__dot" aria-hidden="true"/>
                <time class="notify-card__time">{{ timeOf(item) }}</time>
              </div>

              <div v-if="slowQuery" class="notify-card__detail">
                <p class="notify-card__meta-line">
                  <span v-if="slowQuery.connectionLabel" class="notify-card__meta-item">
                    {{ slowQuery.connectionLabel }}
                  </span>
                  <span class="notify-card__meta-item notify-card__meta-item--warn">
                    {{ slowQuery.duration }}
                  </span>
                  <span class="notify-card__meta-item notify-card__meta-item--muted">
                    ≥ {{ slowQuery.threshold }}ms
                  </span>
                </p>
                <button
                    type="button"
                    class="notify-card__sql"
                    :class="{ 'is-expanded': isSqlExpanded(item.id) }"
                    :title="slowQuery.sql"
                    @click="toggleSqlExpand(item.id)"
                >
                  {{ slowQuery.sql }}
                </button>
              </div>

              <p v-else class="notify-card__body">{{ bodyOf(item) }}</p>

              <div class="notify-card__actions">
                <button
                    v-if="showPrimaryAction(item)"
                    class="notify-card__link"
                    type="button"
                    @click="primaryAction(item)"
                >
                  {{ primaryLabel(item) }}
                </button>
                <button
                    class="notify-card__link notify-card__link--muted"
                    type="button"
                    @click="dismiss(item)"
                >
                  {{ t('notification.actions.dismiss') }}
                </button>
              </div>
            </div>
          </article>
        </section>
      </div>
    </ToolWindowShell>
  </div>
</template>

<style scoped>
.notify-body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  padding: var(--dw-space-3) var(--dw-space-4) var(--dw-space-5);
}

.notify-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-11) var(--dw-space-9) var(--dw-space-10);
  text-align: center;
}

.notify-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-density-lg);
  height: var(--dw-density-lg);
  border-radius: var(--dw-panel-radius);
  color: var(--dw-text-muted);
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-muted));
  border: 1px solid var(--dw-border-light);
}

.notify-empty__title {
  margin: var(--dw-space-1) 0 0;
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
}

.notify-empty__hint {
  max-width: 220px;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.notify-section + .notify-section {
  margin-top: var(--dw-space-2);
}

.notify-section__head {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-1) var(--dw-space-2) var(--dw-space-2);
}

.notify-section__pill {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  background: var(--section-soft);
  color: var(--section-accent);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.notify-section__count {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
  font-variant-numeric: tabular-nums;
}

.notify-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap);
  padding: 7px var(--dw-space-4) 7px 9px;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
  transition: var(--dw-transition-colors);
}

.notify-card + .notify-card {
  margin-top: var(--dw-space-2);
}

.notify-card:hover {
  border-color: color-mix(in srgb, var(--card-accent) 20%, var(--dw-border-light));
}

.notify-card.is-unread {
  background: color-mix(in srgb, var(--card-soft) 45%, var(--dw-bg));
  border-color: color-mix(in srgb, var(--card-accent) 14%, var(--dw-border-light));
}

.notify-card.is-unread::before {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 0;
  width: 2px;
  border-radius: 0 var(--dw-radius-xs) var(--dw-radius-xs) 0;
  background: var(--card-accent);
}

.notify-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-icon-size-xl);
  height: var(--dw-icon-size-xl);
  margin-top: 1px;
  border-radius: var(--dw-control-radius-sm);
  color: var(--card-accent);
  background: var(--card-soft);
}

.notify-card__main {
  min-width: 0;
  flex: 1;
}

.notify-card__top {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.notify-card__title {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 600;
  line-height: var(--dw-leading-tight);
  color: var(--dw-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notify-card__dot {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--card-accent);
}

.notify-card__time {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-tight);
  white-space: nowrap;
}

.notify-card__detail {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  margin-top: 3px;
}

.notify-card__meta-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--dw-space-2) 0;
  margin: 0;
  min-width: 0;
}

.notify-card__meta-item {
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.notify-card__meta-item:not(:last-child)::after {
  content: '·';
  margin: 0 var(--dw-space-2);
  color: var(--dw-text-muted);
}

.notify-card__meta-item--warn {
  color: var(--dw-warning-fg);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.notify-card__meta-item--muted {
  color: var(--dw-text-muted);
  font-variant-numeric: tabular-nums;
}

.notify-card__body {
  margin: var(--dw-space-1) 0 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.notify-card__sql {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.notify-card__sql:hover {
  color: var(--dw-text-secondary);
}

.notify-card__sql.is-expanded {
  white-space: pre-wrap;
  word-break: break-word;
  overflow: visible;
  text-overflow: unset;
  max-height: 72px;
  overflow-y: auto;
}

.notify-card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--dw-space-1) var(--dw-space-4);
  margin-top: var(--dw-space-2);
}

.notify-card__link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-tight);
  white-space: nowrap;
  cursor: pointer;
}

.notify-card__link--muted {
  color: var(--dw-text-muted);
}

.notify-card__link:hover {
  text-decoration: underline;
}
</style>
