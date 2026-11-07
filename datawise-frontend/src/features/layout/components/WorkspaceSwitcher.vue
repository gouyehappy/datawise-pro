<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {ConfirmDialog, EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {useProjectSwitcher} from '@/features/project/composables/useProjectSwitcher'
import CreateProjectDialog from '@/features/project/components/CreateProjectDialog.vue'
import type {ProjectDto} from '@/features/project/services/project-api'
import type {ProjectTemplateId} from '@/features/project/services/project-api'

defineEmits<{
  dblclickDrag: []
}>()

const {t} = useI18n()
const open = ref(false)
const showCreateDialog = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<{top: string; left: string} | undefined>()
const dirtySwitchConfirm = useConfirmDialog('danger')
const deleteProjectConfirm = useConfirmDialog('danger')

const {
  projects,
  recentProjects,
  activeProject,
  loading,
  switching: projectSwitching,
  creating: projectCreating,
  deleting: projectDeleting,
  apiUnavailable,
  projectInitials,
  projectAccent,
  canDeleteProject,
  switchToProject,
  createAndSwitch,
  deleteProject,
  ensureLoaded,
} = useProjectSwitcher()

async function confirmDiscardDirtyTabs(): Promise<boolean> {
  return dirtySwitchConfirm.ask({
    title: t('app.titleBar.projectSwitcher.dirtyTitle'),
    message: t('app.titleBar.projectSwitcher.dirtyMessage'),
    confirmLabel: t('app.titleBar.projectSwitcher.dirtyConfirm'),
    confirmVariant: 'danger',
  })
}

const switching = computed(
    () => projectSwitching.value || projectCreating.value || projectDeleting.value,
)

const triggerTitle = computed(
    () => activeProject.value?.name ?? t('app.titleBar.projectSwitcher.default'),
)

const triggerAccent = computed(() => projectAccent(activeProject.value))
const triggerInitials = computed(() => projectInitials(activeProject.value))

/** IDEA: Open Projects = 当前；Recent = 最近使用优先。 */
const openProjects = computed(() => {
  const active = activeProject.value
  if (!active) return [] as ProjectDto[]
  return projects.value.filter((p) => p.id === active.id)
})

/** 副行始终有内容，形成 IDEA 双行节奏。 */
function projectHint(project: ProjectDto): string {
  const desc = project.description?.trim()
  if (desc) return desc
  if (project.isDefault) return t('app.titleBar.projectSwitcher.defaultTag')
  return t('app.titleBar.projectSwitcher.inAppHint')
}

usePopoverEscape(
    () => open.value,
    () => close(),
    {closeOnOutside: false},
)

function close() {
  open.value = false
  panelStyle.value = undefined
}

function updatePanelPlacement() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  panelStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${Math.max(8, rect.left)}px`,
  }
}

async function toggle() {
  if (loading.value) return
  if (open.value) {
    close()
    return
  }
  open.value = true
  updatePanelPlacement()
  await ensureLoaded().catch(() => {})
}

async function onSelectProject(project: ProjectDto) {
  if (project.id === activeProject.value?.id) return
  close()
  await switchToProject(project.id, {confirmDirty: confirmDiscardDirtyTabs})
}

function onCreateProject() {
  if (apiUnavailable.value) return
  close()
  showCreateDialog.value = true
}

async function onConfirmCreate(payload: {name: string; templateId: ProjectTemplateId}) {
  await createAndSwitch(payload.name, {
    confirmDirty: confirmDiscardDirtyTabs,
    templateId: payload.templateId,
  })
}

function onDeleteProject(project: ProjectDto, event: MouseEvent) {
  event.stopPropagation()
  event.preventDefault()
  if (!canDeleteProject(project)) return
  void confirmDeleteProject(project)
}

async function confirmDeleteProject(project: ProjectDto) {
  close()
  const ok = await deleteProjectConfirm.ask({
    title: t('app.titleBar.projectSwitcher.deleteTitle'),
    message: t('app.titleBar.projectSwitcher.deleteMessage', {name: project.name}),
    confirmLabel: t('app.titleBar.projectSwitcher.deleteConfirm'),
    confirmVariant: 'danger',
  })
  if (!ok) return
  await deleteProject(project)
}

function onDocumentMouseDown(event: MouseEvent) {
  if (!open.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (triggerRef.value?.contains(target)) return
  if (panelRef.value?.contains(target)) return
  close()
}

function onWindowResize() {
  if (open.value) close()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown)
  window.addEventListener('resize', onWindowResize)
  void ensureLoaded().catch(() => {})
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <div class="ws-switcher">
    <button
        ref="triggerRef"
        type="button"
        class="ws-switcher__trigger"
        :class="{ 'is-open': open, 'is-disabled': loading }"
        :disabled="loading"
        :title="triggerTitle"
        :aria-label="t('app.titleBar.projectSwitcher.triggerAria', { name: triggerTitle })"
        :aria-expanded="open"
        @click="toggle"
        @dblclick.stop="$emit('dblclickDrag')"
    >
      <span
          class="ws-switcher__badge"
          :style="{ background: triggerAccent.bg, color: triggerAccent.fg }"
      >{{ triggerInitials }}</span>
      <span class="ws-switcher__name">{{ triggerTitle }}</span>
      <DwIcon class="ws-switcher__caret" name="chevron-down" size="xs" :stroke-width="1.5"/>
    </button>

    <Teleport to="body">
      <Transition name="ws-switcher-drop">
        <div
            v-if="open"
            ref="panelRef"
            class="ws-switcher__panel"
            :style="panelStyle"
            role="menu"
        >
          <!-- IDEA: 顶部动作，图标落在固定 gutter -->
          <div class="ws-switcher__actions">
            <button
                type="button"
                class="ws-switcher__action"
                :disabled="switching || apiUnavailable"
                role="menuitem"
                @click="onCreateProject"
            >
              <span class="ws-switcher__gutter" aria-hidden="true">
                <DwIcon name="plus" size="md" :stroke-width="1.6"/>
              </span>
              <span class="ws-switcher__action-label">{{ t('app.titleBar.projectSwitcher.newProject') }}</span>
            </button>
          </div>

          <div class="ws-switcher__body">
            <section v-if="openProjects.length" class="ws-switcher__section">
              <header class="ws-switcher__section-head">{{ t('app.titleBar.projectSwitcher.current') }}</header>
              <div class="ws-switcher__list">
                <div
                    v-for="project in openProjects"
                    :key="project.id"
                    class="ws-switcher__row-wrap"
                >
                  <button
                      type="button"
                      class="ws-switcher__row is-current"
                      :disabled="switching"
                      role="menuitem"
                      @click="onSelectProject(project)"
                  >
                    <span class="ws-switcher__gutter" aria-hidden="true">
                      <span
                          class="ws-switcher__row-badge"
                          :style="{ background: projectAccent(project).bg, color: projectAccent(project).fg }"
                      >{{ projectInitials(project) }}</span>
                    </span>
                    <span class="ws-switcher__row-copy">
                      <span class="ws-switcher__row-name">{{ project.name }}</span>
                      <span class="ws-switcher__row-hint">{{ projectHint(project) }}</span>
                    </span>
                  </button>
                </div>
              </div>
            </section>

            <section class="ws-switcher__section">
              <header class="ws-switcher__section-head">{{ t('app.titleBar.projectSwitcher.otherProjects') }}</header>
              <div v-if="recentProjects.length" class="ws-switcher__list">
                <div
                    v-for="project in recentProjects"
                    :key="project.id"
                    class="ws-switcher__row-wrap"
                >
                  <button
                      type="button"
                      class="ws-switcher__row"
                      :disabled="switching"
                      role="menuitem"
                      @click="onSelectProject(project)"
                  >
                    <span class="ws-switcher__gutter" aria-hidden="true">
                      <span
                          class="ws-switcher__row-badge"
                          :style="{ background: projectAccent(project).bg, color: projectAccent(project).fg }"
                      >{{ projectInitials(project) }}</span>
                    </span>
                    <span class="ws-switcher__row-copy">
                      <span class="ws-switcher__row-name">{{ project.name }}</span>
                      <span class="ws-switcher__row-hint">{{ projectHint(project) }}</span>
                    </span>
                  </button>
                  <button
                      v-if="canDeleteProject(project)"
                      type="button"
                      class="ws-switcher__remove"
                      :title="t('app.titleBar.projectSwitcher.deleteConfirm')"
                      :aria-label="t('app.titleBar.projectSwitcher.deleteConfirm')"
                      :disabled="switching"
                      @click="onDeleteProject(project, $event)"
                  >
                    <DwIcon name="delete" size="sm" :stroke-width="1.5"/>
                  </button>
                </div>
              </div>
              <EmptyState
                  v-else
                  embedded
                  compact
                  class="ws-switcher__empty"
                  :title="t('app.titleBar.projectSwitcher.empty')"
              />
            </section>
          </div>
        </div>
      </Transition>
    </Teleport>

    <CreateProjectDialog
        :open="showCreateDialog"
        @update:open="showCreateDialog = $event"
        @confirm="onConfirmCreate"
    />

    <ConfirmDialog
        :open="dirtySwitchConfirm.open.value"
        :title="dirtySwitchConfirm.title.value"
        :message="dirtySwitchConfirm.message.value"
        :confirm-label="dirtySwitchConfirm.confirmLabel.value"
        :confirm-variant="dirtySwitchConfirm.confirmVariant.value"
        @update:open="dirtySwitchConfirm.onOpenUpdate"
        @confirm="dirtySwitchConfirm.onConfirm"
    />

    <ConfirmDialog
        :open="deleteProjectConfirm.open.value"
        :title="deleteProjectConfirm.title.value"
        :message="deleteProjectConfirm.message.value"
        :confirm-label="deleteProjectConfirm.confirmLabel.value"
        :confirm-variant="deleteProjectConfirm.confirmVariant.value"
        @update:open="deleteProjectConfirm.onOpenUpdate"
        @confirm="deleteProjectConfirm.onConfirm"
    />
  </div>
</template>

<style scoped>
.ws-switcher {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 100%;
  -webkit-app-region: no-drag;
}

/*
 * IDEA New UI 工具条控件：色块徽标贴左 + 名称 + 细 chevron；
 * 默认透明，悬停才出现浅底，像 breadcrumb widget 而非独立按钮。
 */
.ws-switcher__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--dw-density-sm);
  max-width: min(240px, 32vw);
  margin-left: 0;
  padding: 0 6px 0 3px;
  border: none;
  border-radius: var(--dw-titlebar-chip-radius);
  background: transparent;
  color: var(--dw-text);
  cursor: pointer;
  transition: background 100ms ease;
}

.ws-switcher__trigger:hover:not(.is-disabled),
.ws-switcher__trigger.is-open {
  background: var(--dw-titlebar-chip-hover);
}

.ws-switcher__trigger.is-disabled {
  cursor: default;
  opacity: 0.72;
}

.ws-switcher__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-font-size-badge);
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1;
  user-select: none;
}

.ws-switcher__name {
  min-width: 0;
  font-size: var(--dw-font-size-titlebar);
  font-weight: 500;
  line-height: 1;
  color: var(--dw-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-switcher__caret {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  opacity: 0.45;
  color: var(--dw-text-muted);
  transition: transform 140ms ease, opacity 120ms ease;
}

.ws-switcher__trigger:hover:not(.is-disabled) .ws-switcher__caret,
.ws-switcher__trigger.is-open .ws-switcher__caret {
  opacity: 0.75;
}

.ws-switcher__trigger.is-open .ws-switcher__caret {
  transform: rotate(180deg);
}

.ws-switcher__panel {
  position: fixed;
  z-index: var(--dw-z-max);
  width: min(380px, calc(100vw - 20px));
  max-height: min(520px, calc(100vh - 40px));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dw-menu-border);
  border-radius: var(--dw-menu-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-menu-shadow);
  -webkit-app-region: no-drag;
}

.ws-switcher__actions {
  flex-shrink: 0;
  padding: var(--dw-menu-pad-y) var(--dw-menu-pad-x);
  border-bottom: 1px solid color-mix(in srgb, var(--dw-text) 8%, transparent);
}

.ws-switcher__action {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: var(--dw-menu-item-h);
  padding: 0 8px 0 0;
  border: none;
  border-radius: var(--dw-menu-item-radius);
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-font-size-menu);
  font-weight: 400;
  text-align: left;
  cursor: pointer;
}

.ws-switcher__action:hover:not(:disabled) {
  background: var(--dw-menu-active);
}

.ws-switcher__action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ws-switcher__gutter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-menu-gutter);
  height: 100%;
  color: var(--dw-text-secondary);
}

.ws-switcher__action-label {
  min-width: 0;
  padding-right: 8px;
}

.ws-switcher__body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 4px var(--dw-menu-pad-x) var(--dw-menu-pad-y);
}

.ws-switcher__section + .ws-switcher__section {
  margin-top: 4px;
}

.ws-switcher__section-head {
  padding: 8px 8px 4px var(--dw-menu-gutter);
  font-size: var(--dw-font-size-menu-caption);
  font-weight: 600;
  color: var(--dw-text-muted);
  letter-spacing: 0.01em;
}

.ws-switcher__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ws-switcher__empty {
  margin: 0;
  padding: 10px 12px 12px var(--dw-menu-gutter);
  font-size: var(--dw-font-size-menu-caption);
  color: var(--dw-text-muted);
}

.ws-switcher__row-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 0;
  border-radius: var(--dw-menu-item-radius);
}

.ws-switcher__row-wrap:hover {
  background: var(--dw-menu-hover);
}

.ws-switcher__row {
  display: flex;
  align-items: center;
  gap: 0;
  width: 100%;
  min-height: var(--dw-density-xl);
  padding: 5px 4px 5px 0;
  border: none;
  border-radius: var(--dw-menu-item-radius) 0 0 var(--dw-menu-item-radius);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.ws-switcher__row-wrap:not(:has(.ws-switcher__remove)) .ws-switcher__row {
  border-radius: var(--dw-menu-item-radius);
  padding-right: 8px;
}

.ws-switcher__row.is-current {
  cursor: default;
}

.ws-switcher__row:disabled {
  cursor: default;
}

.ws-switcher__row-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--dw-density-sm);
  border-radius: var(--dw-control-radius);
  font-size: var(--dw-font-size-badge);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  user-select: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-on-accent) 12%, transparent);
}

.ws-switcher__row-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding-right: 4px;
}

.ws-switcher__row-name {
  font-size: var(--dw-font-size-menu);
  font-weight: 500;
  color: var(--dw-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-switcher__row-hint {
  font-size: var(--dw-font-size-menu-caption);
  line-height: 1.25;
  color: var(--dw-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 与行共用悬停底；无独立色块，仅图标淡入 */
.ws-switcher__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  width: 40px;
  margin: 0;
  padding: 0 10px 0 4px;
  border: none;
  border-radius: 0 var(--dw-menu-item-radius) var(--dw-menu-item-radius) 0;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--dw-duration-fast) var(--dw-ease),
    color var(--dw-duration-fast) var(--dw-ease);
}

.ws-switcher__row-wrap:hover .ws-switcher__remove {
  opacity: 0.5;
}

.ws-switcher__remove:hover:not(:disabled),
.ws-switcher__remove:focus-visible {
  opacity: 1;
  color: var(--dw-text);
  background: transparent;
  outline: none;
}

.ws-switcher__remove:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.ws-switcher-drop-enter-active,
.ws-switcher-drop-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.ws-switcher-drop-enter-from,
.ws-switcher-drop-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
