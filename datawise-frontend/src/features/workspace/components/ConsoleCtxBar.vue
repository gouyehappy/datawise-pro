<!--
  SQL 控制台右上角：数据源 → 实例 两级选择

  数据来自连接树（extractDataSources），切换数据源会自动刷新实例列表。
  使用 v-model:connection-id 和 v-model:instance-id 与父组件双向绑定。
-->
<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DwIcon} from '@/core/icons'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
import type {DataSourceOption, DbType} from '@/core/types'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {
  resolveBoundInstanceId,
  resolveInstanceDisplayLabel,
} from '@/features/explorer/utils/data-sources'
import {
  consoleInstanceMenuKey,
  consoleInstanceScopeKey,
  formatConsoleInstanceOption,
  showsConsoleInstanceSelector,
} from '@/features/workspace/services/console-instance-display'
import ConnectionEnvBadge from '@/features/explorer/components/ConnectionEnvBadge.vue'
import {resolveConnectionEnvBadgeTone} from '@/features/connection/services/connection-environment.service'

const {t} = useI18n()
const explorer = useExplorerStore()

const props = defineProps<{
  dataSources: DataSourceOption[]
  /** workspaces 脚本绑定的库名；树未加载时用于展示与回绑 instanceId */
  boundDatabaseLabel?: string
  /** 已保存 workspaces 脚本：禁止连接断开时自动切换数据源/实例 */
  contextLocked?: boolean
  /** contextLocked 且当前连接不在可选列表时的展示名 */
  boundConnectionLabel?: string
  boundConnectionDbType?: DbType
  /** 只读展示：禁止切换数据源/实例 */
  readOnly?: boolean
}>()

const connectionId = defineModel<string>('connectionId', {required: true})
const instanceId = defineModel<string | null>('instanceId', {required: true})

const rootRef = ref<HTMLElement>()
const menuOpen = ref(false)
const menuTab = ref<'source' | 'instance'>('source')

const panelOpen = computed(() => menuOpen.value)

usePopoverEscape(panelOpen, () => {
  menuOpen.value = false
}, {
  containRefs: () => [rootRef.value],
})

const activeSource = computed(() =>
    props.dataSources.find((source) => source.id === connectionId.value),
)

const hasInstances = computed(() => (activeSource.value?.instances.length ?? 0) > 0)

const showInstanceSelector = computed(() =>
    showsConsoleInstanceSelector(activeSource.value?.dbType),
)

const instanceMenuKey = computed(() => consoleInstanceMenuKey(activeSource.value?.dbType))

const instanceTabLabel = computed(() =>
    t(`console.${consoleInstanceScopeKey(activeSource.value?.dbType)}`),
)

const instanceDisplayLabel = computed(() =>
    resolveInstanceDisplayLabel({
      instances: activeSource.value?.instances ?? [],
      instanceId: instanceId.value,
      boundDatabaseLabel: props.boundDatabaseLabel,
      dbType: activeSource.value?.dbType ?? props.boundConnectionDbType,
    }),
)

const displaySourceLabel = computed(
    () => activeSource.value?.label ?? props.boundConnectionLabel ?? '—',
)

const displaySourceDbType = computed(
    () => activeSource.value?.dbType ?? props.boundConnectionDbType,
)

const activeConnectionNode = computed(() =>
    connectionId.value ? explorer.findNode(connectionId.value) : null,
)

const activeEnvTone = computed(() =>
    resolveConnectionEnvBadgeTone(activeConnectionNode.value?.env, activeConnectionNode.value?.envCustom),
)

const showEnvBadge = computed(() => {
    const tone = activeEnvTone.value
    return tone === 'prod' || tone === 'staging' || tone === 'custom'
})

function sourceEnv(sourceId: string) {
    const node = explorer.findNode(sourceId)
    return {env: node?.env, envCustom: node?.envCustom}
}

function sourceEnvTone(sourceId: string) {
    const node = explorer.findNode(sourceId)
    return resolveConnectionEnvBadgeTone(node?.env, node?.envCustom)
}

watch(
    () => [connectionId.value, props.dataSources, props.boundDatabaseLabel, props.contextLocked] as const,
    () => {
      const source = activeSource.value
      if (props.contextLocked) {
        if (!source) return
        if (!showInstanceSelector.value || !source.instances.length) {
          return
        }
        const nextInstanceId = resolveBoundInstanceId({
          instances: source.instances,
          tabInstanceId: instanceId.value,
          tabDatabase: props.boundDatabaseLabel,
          preserveBinding: true,
        })
        if (instanceId.value !== nextInstanceId) {
          instanceId.value = nextInstanceId
        }
        return
      }
      if (!source) {
        if (connectionId.value) return
        if (props.dataSources.length) connectionId.value = props.dataSources[0].id
        return
      }
      if (!showInstanceSelector.value || !source.instances.length) {
        return
      }
      const nextInstanceId = resolveBoundInstanceId({
        instances: source.instances,
        tabInstanceId: instanceId.value,
        tabDatabase: props.boundDatabaseLabel,
      })
      if (instanceId.value !== nextInstanceId) {
        instanceId.value = nextInstanceId
      }
    },
    {immediate: true},
)

function toggleMenu() {
  if (props.readOnly) return
  const nextOpen = !menuOpen.value
  if (nextOpen) {
    menuTab.value = showInstanceSelector.value && connectionId.value && hasInstances.value
        ? 'instance'
        : 'source'
  }
  menuOpen.value = nextOpen
}

function sourceNeedsInstancePicker(source: DataSourceOption | undefined): boolean {
  if (!source) return false
  return showsConsoleInstanceSelector(source.dbType)
}

async function pickSource(id: string) {
  connectionId.value = id
  // On-demand: load schema for the chosen source only (cold connections have empty instances).
  let source = props.dataSources.find((item) => item.id === id)
  if (!source?.instances.length) {
    await explorer.ensureChildrenLoaded(id)
    source = props.dataSources.find((item) => item.id === id)
  }
  if (sourceNeedsInstancePicker(source)) {
    menuTab.value = 'instance'
    return
  }
  menuOpen.value = false
}

function pickInstance(id: string) {
  instanceId.value = id
  menuOpen.value = false
}

function displayInstanceOption(label: string) {
  return formatConsoleInstanceOption(activeSource.value?.dbType, label)
}
</script>

<template>
  <div ref="rootRef" class="ctx-bar">
    <div class="ctx-segment">
      <button
          v-if="!readOnly"
          class="ctx-merged"
          :class="{ open: menuOpen, [`ctx-merged--env-${activeEnvTone}`]: showEnvBadge }"
          type="button"
          :title="t('console.selectDataSource')"
          @click="toggleMenu"
      >
        <DbTypeIcon
            v-if="displaySourceDbType"
            class="ctx-icon"
            :db-type="displaySourceDbType"
            :size="DB_TYPE_ICON_SIZE.list"
        />
        <span class="ctx-merged-text">
          <span class="ctx-merged-source">{{ displaySourceLabel }}</span>
          <template v-if="showInstanceSelector">
            <span class="ctx-merged-sep" aria-hidden="true">·</span>
            <span class="ctx-merged-instance">{{ instanceDisplayLabel ?? t('console.noInstance') }}</span>
          </template>
        </span>
        <ConnectionEnvBadge
            v-if="showEnvBadge"
            class="ctx-env-badge"
            :env="activeConnectionNode?.env"
            :env-custom="activeConnectionNode?.envCustom"
        />
        <DwIcon class="ctx-caret" name="chevron-down" size="xs" :stroke-width="1.5"/>
      </button>
      <div
          v-else
          class="ctx-merged ctx-merged--readonly"
          :class="{[`ctx-merged--env-${activeEnvTone}`]: showEnvBadge}"
      >
        <DbTypeIcon
            v-if="displaySourceDbType"
            class="ctx-icon"
            :db-type="displaySourceDbType"
            :size="DB_TYPE_ICON_SIZE.list"
        />
        <span class="ctx-merged-text">
          <span class="ctx-merged-source">{{ displaySourceLabel }}</span>
          <template v-if="showInstanceSelector">
            <span class="ctx-merged-sep" aria-hidden="true">·</span>
            <span class="ctx-merged-instance">{{ instanceDisplayLabel ?? t('console.noInstance') }}</span>
          </template>
        </span>
        <ConnectionEnvBadge
            v-if="showEnvBadge"
            class="ctx-env-badge"
            :env="activeConnectionNode?.env"
            :env-custom="activeConnectionNode?.envCustom"
        />
      </div>

      <div v-if="menuOpen && !readOnly" class="ctx-menu ctx-menu--unified">
        <div class="ctx-menu-tabs" role="tablist">
          <button
              type="button"
              class="ctx-menu-tab"
              :class="{ active: menuTab === 'source' }"
              role="tab"
              :aria-selected="menuTab === 'source'"
              @click="menuTab = 'source'"
          >
            {{ t('console.ctxDataSource') }}
          </button>
          <button
              v-if="showInstanceSelector"
              type="button"
              class="ctx-menu-tab"
              :class="{ active: menuTab === 'instance' }"
              role="tab"
              :aria-selected="menuTab === 'instance'"
              :disabled="!connectionId"
              @click="menuTab = 'instance'"
          >
            {{ instanceTabLabel }}
          </button>
        </div>

        <div v-if="menuTab === 'instance' && activeSource" class="ctx-menu-subhead">
          {{ activeSource.label }} · {{ t(`console.${instanceMenuKey}`) }}
        </div>

        <div class="ctx-menu-scroll">
          <template v-if="menuTab === 'source'">
            <div v-if="!dataSources.length" class="ctx-menu-empty">
              {{ t('console.noConnectableDataSource') }}
            </div>
            <template v-else>
              <button
                  v-for="source in dataSources"
                  :key="source.id"
                  class="ctx-item"
                  :class="{
                    active: source.id === connectionId,
                    [`ctx-item--env-${sourceEnvTone(source.id)}`]: sourceEnvTone(source.id) !== 'dev',
                  }"
                  type="button"
                  @click="pickSource(source.id)"
              >
                <DbTypeIcon class="ctx-item-icon" :db-type="source.dbType" :size="DB_TYPE_ICON_SIZE.list"/>
                <span class="ctx-item-body">
                  <span class="ctx-item-label">{{ source.label }}</span>
                  <span class="ctx-item-meta">
                    {{
                      source.instances.length ? t('explorer.instanceCount', {count: source.instances.length}) : t('explorer.noInstances')
                    }}
                  </span>
                </span>
                <ConnectionEnvBadge
                    v-if="sourceEnvTone(source.id) !== 'dev'"
                    class="ctx-item-env"
                    :env="sourceEnv(source.id).env"
                    :env-custom="sourceEnv(source.id).envCustom"
                />
                <DwIcon v-if="source.id === connectionId" class="ctx-check" name="submit" size="xs" :stroke-width="1.6"/>
              </button>
            </template>
          </template>

          <template v-else-if="showInstanceSelector">
            <div v-if="!hasInstances" class="ctx-menu-empty">
              {{ t('console.noInstancesForSource') }}
            </div>
            <template v-else>
              <button
                  v-for="item in activeSource?.instances"
                  :key="item.id"
                  class="ctx-item"
                  :class="{ active: item.id === instanceId }"
                  type="button"
                  @click="pickInstance(item.id)"
              >
                <DwIcon class="ctx-item-icon ctx-schema-icon" name="database" size="sm" :stroke-width="1.3"/>
                <span class="ctx-item-body">
                  <span class="ctx-item-label">{{ displayInstanceOption(item.label).primary }}</span>
                  <span v-if="displayInstanceOption(item.label).meta" class="ctx-item-meta">
                    {{ displayInstanceOption(item.label).meta }}
                  </span>
                </span>
                <DwIcon v-if="item.id === instanceId" class="ctx-check" name="submit" size="xs" :stroke-width="1.6"/>
              </button>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ctx-bar {
  display: inline-flex;
  align-items: center;
  height: auto;
  background: transparent;
}

.ctx-segment {
  position: relative;
}

.ctx-merged {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  max-width: min(320px, 42vw);
  height: var(--dw-console-btn-size);
  min-width: 0;
  padding: 0 var(--dw-space-3);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-bg-muted) 55%, transparent);
  color: var(--dw-text-secondary);
  transition: var(--dw-transition-colors);
}

.ctx-merged:hover:not(.ctx-merged--readonly) {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  border-color: color-mix(in srgb, var(--dw-border) 80%, transparent);
}

.ctx-merged.open {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  border-color: color-mix(in srgb, var(--dw-border) 80%, transparent);
}

.ctx-merged--env-prod {
  color: var(--dw-danger-fg);
  background: color-mix(in srgb, var(--dw-danger) 10%, transparent);
  border-color: color-mix(in srgb, var(--dw-danger) 36%, transparent);
  box-shadow: inset 3px 0 0 var(--dw-danger);
}

.ctx-merged--env-staging {
  color: var(--dw-warning-fg);
  background: color-mix(in srgb, var(--mp-tone-amber) 10%, transparent);
  border-color: color-mix(in srgb, var(--mp-tone-amber) 36%, transparent);
  box-shadow: inset 3px 0 0 var(--mp-tone-amber);
}

.ctx-merged--env-custom {
  box-shadow: none;
}

.ctx-env-badge {
  margin-left: 0;
}

.ctx-item-env {
  margin-left: auto;
}

.ctx-item--env-prod {
  box-shadow: inset 3px 0 0 var(--dw-danger);
}

.ctx-item--env-staging {
  box-shadow: inset 3px 0 0 var(--mp-tone-amber);
}

.ctx-merged--readonly {
  cursor: default;
}

.ctx-icon {
  flex-shrink: 0;
}

.ctx-icon :deep(.db-icon--framed) {
  box-shadow: none;
}

.ctx-merged-text {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: var(--dw-gap-xs);
  font-size: var(--dw-text-xs);
  line-height: 1;
}

.ctx-merged-source,
.ctx-merged-instance {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.ctx-merged-source {
  max-width: 148px;
}

.ctx-merged-instance {
  max-width: 108px;
  color: var(--dw-text-muted);
}

.ctx-merged-sep {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  opacity: 0.55;
}

.ctx-caret {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--dw-text-muted);
  transition: transform var(--dw-duration) var(--dw-ease);
}

.ctx-merged.open .ctx-caret {
  transform: rotate(180deg);
}

.ctx-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  left: auto;
  z-index: var(--dw-z-drawer);
  min-width: 240px;
  max-width: min(320px, 90vw);
  padding: var(--dw-space-2);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
  box-shadow: var(--dw-shadow-float);
}

.ctx-menu--unified {
  display: flex;
  flex-direction: column;
  max-height: min(420px, 70vh);
  overflow: hidden;
  padding: 0;
}

.ctx-menu-tabs {
  display: flex;
  gap: var(--dw-space-1);
  flex-shrink: 0;
  padding: var(--dw-space-2) var(--dw-space-2) 0;
  border-bottom: 1px solid var(--dw-border-light);
}

.ctx-menu-tab {
  flex: 1;
  min-width: 0;
  padding: var(--dw-space-3) var(--dw-space-4);
  border-radius: var(--dw-control-radius-sm) var(--dw-control-radius-sm) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 500;
  line-height: var(--dw-leading-tight);
  text-align: center;
  transition: background var(--dw-duration-fast) var(--dw-ease), color var(--dw-duration-fast) var(--dw-ease);
}

.ctx-menu-tab:hover:not(:disabled) {
  color: var(--dw-text-secondary);
  background: var(--dw-bg-hover);
}

.ctx-menu-tab.active {
  color: var(--dw-text);
  background: var(--dw-bg-hover);
  box-shadow: inset 0 -2px 0 var(--dw-primary);
}

.ctx-menu-tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ctx-menu-subhead {
  flex-shrink: 0;
  padding: var(--dw-space-3) var(--dw-space-5) var(--dw-space-2);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  border-bottom: 1px solid var(--dw-border-light);
}

.ctx-menu-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--dw-space-2);
}

.ctx-menu-empty {
  padding: var(--dw-space-7) var(--dw-space-6);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  width: 100%;
  padding: var(--dw-pad-control);
  border-radius: var(--dw-control-radius-sm);
  text-align: left;
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
  transition: background var(--dw-duration-fast) var(--dw-ease), color var(--dw-duration-fast) var(--dw-ease);
}

.ctx-item:hover {
  background: var(--dw-bg-hover);
}

.ctx-item.active {
  background: var(--dw-bg-hover);
  color: var(--dw-text);
}

.ctx-item-icon {
  flex-shrink: 0;
}

.ctx-schema-icon {
  color: var(--dw-text-muted);
}

.ctx-item-body {
  flex: 1;
  min-width: 0;
}

.ctx-item-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.ctx-item-meta {
  display: block;
  margin-top: 1px;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.ctx-check {
  flex-shrink: 0;
  color: var(--dw-text-secondary);
}
</style>
