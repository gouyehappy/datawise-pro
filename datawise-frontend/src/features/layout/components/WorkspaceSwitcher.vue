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

/** IDEA: Open Projects = 当前；Recent = 其余。 */
const openProjects = computed(() => {
  const active = activeProject.value
  if (!active) return [] as ProjectDto[]
  return projects.value.filter((p) => p.id === active.id)
})

/** 副行：当前打开优先；否则描述 / 默认标签 / 应用内。 */
function projectHint(project: ProjectDto): string {
  if (activeProject.value?.id === project.id) {
    return t('app.titleBar.projectSwitcher.currentOpen')
  }
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
  const projectId = project.id
  if (!projectId || projectId === activeProject.value?.id) return
  close()
  await switchToProject(projectId, {confirmDirty: confirmDiscardDirtyTabs})
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
          <div class="ws-switcher__actions">
            <button
                type="button"
                class="ws-switcher__action"
                :disabled="switching || apiUnavailable"
                role="menuitem"
                @click="onCreateProject"
            >
              <span class="ws-switcher__gutter" aria-hidden="true">
                <DwIcon name="plus" size="menu" :stroke-width="1.7"/>
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
                    class="ws-switcher__row-wrap is-current"
                >
                  <button
                      type="button"
                      class="ws-switcher__row"
                      :disabled="switching"
                      role="menuitem"
                      aria-current="true"
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
                    <DwIcon class="ws-switcher__check" name="check" size="sm" :stroke-width="2"/>
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
                    <DwIcon name="delete" size="xs" :stroke-width="1.6"/>
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

/* 顶栏触发：色块 + 名称 + chevron，悬停才出底 */
.ws-switcher__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--dw-titlebar-widget-h);
  max-width: min(240px, 32vw);
  padding: 0 7px 0 4px;
  border: none;
  border-radius: var(--dw-titlebar-chip-radius);
  background: transparent;
  color: var(--dw-titlebar-fg-strong);
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
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
  user-select: none;
}

.ws-switcher__name {
  min-width: 0;
  font-size: var(--dw-font-size-titlebar);
  font-weight: 500;
  line-height: 1;
  color: var(--dw-titlebar-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-switcher__trigger:hover:not(.is-disabled) .ws-switcher__name,
.ws-switcher__trigger.is-open .ws-switcher__name {
  color: var(--dw-titlebar-fg-strong);
}

.ws-switcher__caret {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
  opacity: 0.4;
  color: var(--dw-titlebar-fg-muted);
  transition: transform 140ms ease, opacity 120ms ease;
}

.ws-switcher__trigger:hover:not(.is-disabled) .ws-switcher__caret,
.ws-switcher__trigger.is-open .ws-switcher__caret {
  opacity: 0.8;
}

.ws-switcher__trigger.is-open .ws-switcher__caret {
  transform: rotate(180deg);
}

.ws-switcher__panel {
  position: fixed;
  z-index: var(--dw-z-max);
  width: min(300px, calc(100vw - 20px));
  max-height: min(480px, calc(100vh - 40px));
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
  padding: var(--dw-menu-pad-y) var(--dw-menu-pad-x) 2px;
}

.ws-switcher__action {
  display: grid;
  grid-template-columns: var(--dw-menu-gutter) minmax(0, 1fr);
  align-items: center;
  width: 100%;
  min-height: var(--dw-menu-item-h);
  padding: 0 var(--dw-menu-item-pad-end) 0 0;
  border: none;
  border-radius: var(--dw-menu-item-radius);
  background: transparent;
  color: var(--dw-text);
  font: inherit;
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
}

.ws-switcher__body {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 2px var(--dw-menu-pad-x) var(--dw-menu-pad-y);
  border-top: 1px solid color-mix(in srgb, var(--dw-text) 8%, transparent);
  margin-top: 2px;
}

.ws-switcher__section + .ws-switcher__section {
  margin-top: 2px;
}

.ws-switcher__section-head {
  padding: 8px 8px 4px var(--dw-menu-gutter);
  font-size: var(--dw-font-size-menu-caption);
  font-weight: 600;
  color: var(--dw-text-muted);
  letter-spacing: 0.02em;
}

.ws-switcher__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ws-switcher__empty {
  margin: 0;
  padding: 8px 10px 10px var(--dw-menu-gutter);
  font-size: var(--dw-font-size-menu-caption);
  color: var(--dw-text-muted);
}

.ws-switcher__row-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  border-radius: var(--dw-menu-item-radius);
}

.ws-switcher__row-wrap:hover,
.ws-switcher__row-wrap.is-current {
  background: var(--dw-menu-hover);
}

.ws-switcher__row-wrap:hover {
  background: var(--dw-menu-active);
}

.ws-switcher__row {
  display: grid;
  grid-template-columns: var(--dw-menu-gutter) minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 4px var(--dw-menu-item-pad-end) 4px 0;
  border: none;
  border-radius: var(--dw-menu-item-radius);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.ws-switcher__row-wrap:has(.ws-switcher__remove) .ws-switcher__row {
  border-radius: var(--dw-menu-item-radius) 0 0 var(--dw-menu-item-radius);
  padding-right: 0;
}

.ws-switcher__row.is-current,
.ws-switcher__row-wrap.is-current .ws-switcher__row {
  cursor: default;
}

.ws-switcher__row:disabled {
  cursor: default;
}

.ws-switcher__row-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
  user-select: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 14%, transparent);
}

.ws-switcher__row-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  padding-right: 6px;
}

.ws-switcher__row-name {
  font-size: var(--dw-font-size-menu);
  font-weight: 500;
  line-height: 1.25;
  color: var(--dw-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-switcher__row-hint {
  font-size: var(--dw-font-size-menu-caption);
  font-weight: 400;
  line-height: 1.25;
  color: var(--dw-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-switcher__check {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-right: 2px;
  color: var(--dw-text-secondary);
  opacity: 0.9;
}

.ws-switcher__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  margin: 0 2px 0 0;
  padding: 0;
  border: none;
  border-radius: var(--dw-menu-item-radius);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 100ms ease, color 100ms ease, background 100ms ease;
}

.ws-switcher__row-wrap:hover .ws-switcher__remove {
  opacity: 0.55;
}

.ws-switcher__remove:hover:not(:disabled),
.ws-switcher__remove:focus-visible {
  opacity: 1;
  color: var(--dw-danger);
  background: color-mix(in srgb, var(--dw-danger) 12%, transparent);
  outline: none;
}

.ws-switcher__remove:disabled {
  cursor: not-allowed;
  opacity: 0.28;
}

.ws-switcher-drop-enter-active,
.ws-switcher-drop-leave-active {
  transition: opacity 110ms ease, transform 110ms ease;
}

.ws-switcher-drop-enter-from,
.ws-switcher-drop-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
