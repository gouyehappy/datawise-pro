<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {CollapseButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import QueryResultViewOptions from '@/features/workspace/components/QueryResultViewOptions.vue'
import type {QueryResultItem} from '@/features/workspace/types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {createHttpCommunityPluginsApi} from '@/shared/api/http/community-plugins'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {useCommunityPluginContributionStore} from '@/features/community-plugin/stores/community-plugin-contributions'
import {useQueryResultPaneSettingsStore} from '@/features/workspace/stores/query-result-pane-settings'

/**
 * 结果区右上的操作组：对比上一结果、插件结果视图、视图选项、收起面板。
 *
 * 从 `QueryResultPane` 抽出：这组控件自成一体（弹层开合、外部点击/ESC 关闭、
 * 插件贡献加载），与结果内容的渲染无关，独立后父组件只保留「结果是什么」的逻辑。
 */
const props = withDefaults(defineProps<{
    canCompare: boolean
    activeResult: QueryResultItem | null
    showGridViewOptions: boolean
    showLayoutViewOption: boolean
    collapsible: boolean
}>(), {
    canCompare: false,
    activeResult: null,
    showGridViewOptions: true,
    showLayoutViewOption: true,
    collapsible: false,
})

const emit = defineEmits<{
    compare: []
    collapse: []
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const resultPaneSettings = useQueryResultPaneSettingsStore()
const communityContributions = useCommunityPluginContributionStore()

const communityResultViews = computed(() => communityContributions.resultViews())
const communityResultMenuOpen = ref(false)
const communityResultMenuRef = ref<HTMLElement | null>(null)
const communityResultTriggerRef = ref<HTMLElement | null>(null)
const settingsMenuOpen = ref(false)
const settingsMenuRef = ref<HTMLElement | null>(null)
const settingsTriggerRef = ref<HTMLElement | null>(null)
const viewOptionsRef = ref<{panelEl: HTMLElement | null} | null>(null)

usePopoverEscape(
    () => settingsMenuOpen.value,
    () => {
        settingsMenuOpen.value = false
    },
    {
        containRefs: () => [
            settingsMenuRef.value,
            settingsTriggerRef.value,
            viewOptionsRef.value?.panelEl ?? null,
        ],
    },
)

usePopoverEscape(
    () => communityResultMenuOpen.value,
    () => {
        communityResultMenuOpen.value = false
    },
    {
        containRefs: () => [
            communityResultMenuRef.value,
            communityResultTriggerRef.value,
        ],
    },
)

function toggleSettingsMenu() {
    settingsMenuOpen.value = !settingsMenuOpen.value
    if (settingsMenuOpen.value) communityResultMenuOpen.value = false
}

function toggleCommunityResultMenu() {
    communityResultMenuOpen.value = !communityResultMenuOpen.value
    if (communityResultMenuOpen.value) settingsMenuOpen.value = false
}

function communityInvokeMessage(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null
    const record = result as Record<string, unknown>
    for (const key of ['message', 'detail', 'status'] as const) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) return value
    }
    return null
}

async function invokeCommunityResultView(pluginId: string, contributionId: string) {
    communityResultMenuOpen.value = false
    const active = props.activeResult
    try {
        const api = createHttpCommunityPluginsApi()
        const result = await api.invoke(pluginId, 'result-view/open', {
            contributionId,
            resultId: active?.id,
            sql: active?.sql,
            status: active?.status,
            rowCount: active?.rows?.length,
            columnCount: active?.columns?.length,
        })
        void result
        // 插件已打开结果视图，无需再 toast。
    } catch (error) {
        layout.showErrorToast(
            resolveCaughtApiErrorMessage(error, t, 'communityPlugin.resultViewFailed'),
        )
    }
}

function onCommunityPluginChanged() {
    void communityContributions.refresh()
}

onMounted(() => {
    communityContributions.ensureLoaded()
    window.addEventListener('dw-community-plugin-changed', onCommunityPluginChanged)
})

onUnmounted(() => {
    window.removeEventListener('dw-community-plugin-changed', onCommunityPluginChanged)
})
</script>

<template>
  <button
      v-if="canCompare"
      class="dw-icon-btn result-compare-btn"
      type="button"
      :title="t('queryResult.compareWithPrevious')"
      :aria-label="t('queryResult.compareWithPrevious')"
      @click="emit('compare')"
  >
    <DwIcon name="arrow-up-down" size="lg" :stroke-width="1.55"/>
  </button>
  <div
      v-if="communityResultViews.length"
      ref="communityResultMenuRef"
      class="result-pane-settings community-result-views"
  >
    <button
        ref="communityResultTriggerRef"
        class="dw-icon-btn result-pane-settings__trigger"
        type="button"
        :title="t('communityPlugin.resultViewMenu')"
        :aria-label="t('communityPlugin.resultViewMenu')"
        :aria-expanded="communityResultMenuOpen"
        :class="{ 'is-open': communityResultMenuOpen }"
        @click="toggleCommunityResultMenu"
    >
      <DwIcon name="star" size="lg" :stroke-width="1.55"/>
    </button>
    <div
        v-if="communityResultMenuOpen"
        class="community-result-views__menu"
        role="menu"
    >
      <button
          v-for="view in communityResultViews"
          :key="`${view.pluginId}:${view.id}`"
          type="button"
          class="community-result-views__item"
          role="menuitem"
          @click="invokeCommunityResultView(view.pluginId, view.id)"
      >
        {{ view.label }}
      </button>
    </div>
  </div>
  <div ref="settingsMenuRef" class="result-pane-settings">
    <button
        ref="settingsTriggerRef"
        class="dw-icon-btn result-pane-settings__trigger"
        type="button"
        :title="t('queryResult.settings.menu')"
        :aria-label="t('queryResult.settings.menu')"
        :aria-expanded="settingsMenuOpen"
        :class="{ 'is-open': settingsMenuOpen }"
        @click="toggleSettingsMenu"
    >
      <DwIcon name="tools" size="lg" :stroke-width="1.55"/>
    </button>
    <QueryResultViewOptions
        v-if="settingsMenuOpen"
        ref="viewOptionsRef"
        :anchor-el="settingsTriggerRef"
        :sort-order="resultPaneSettings.settings.sortOrder"
        :keep-existing-results="resultPaneSettings.settings.keepExistingResults"
        :show-field-types="resultPaneSettings.settings.showFieldTypes"
        :show-field-comments="resultPaneSettings.settings.showFieldComments"
        :wrap-cells="resultPaneSettings.settings.wrapCells"
        :result-layout="resultPaneSettings.settings.resultLayout"
        :column-density="resultPaneSettings.settings.columnDensity"
        :numeric-align="resultPaneSettings.settings.numericAlign"
        :hide-null-columns="resultPaneSettings.settings.hideNullColumns"
        :type-coloring="resultPaneSettings.settings.typeColoring"
        :show-grid-options="showGridViewOptions"
        :show-layout-option="showLayoutViewOption"
        @update:sort-order="resultPaneSettings.patchSettings({ sortOrder: $event })"
        @update:keep-existing-results="resultPaneSettings.patchSettings({ keepExistingResults: $event })"
        @update:show-field-types="resultPaneSettings.patchSettings({ showFieldTypes: $event })"
        @update:show-field-comments="resultPaneSettings.patchSettings({ showFieldComments: $event })"
        @update:wrap-cells="resultPaneSettings.patchSettings({ wrapCells: $event })"
        @update:result-layout="resultPaneSettings.patchSettings({ resultLayout: $event })"
        @update:column-density="resultPaneSettings.patchSettings({ columnDensity: $event })"
        @update:numeric-align="resultPaneSettings.patchSettings({ numericAlign: $event })"
        @update:hide-null-columns="resultPaneSettings.patchSettings({ hideNullColumns: $event })"
        @update:type-coloring="resultPaneSettings.patchSettings({ typeColoring: $event })"
    />
  </div>
  <CollapseButton v-if="collapsible" @click="emit('collapse')"/>
</template>


<style scoped>
.result-compare-btn {
  margin-right: 4px;
}

.result-pane-settings {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
}

.result-pane-settings__trigger.is-open {
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, transparent);
  border-color: color-mix(in srgb, var(--dw-border) 88%, var(--dw-text) 12%);
  color: var(--dw-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.community-result-views__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  min-width: 180px;
  padding: 4px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-radius-md, 8px);
  background: var(--dw-bg-elevated, var(--dw-bg));
  box-shadow: var(--dw-shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
}

.community-result-views__item {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dw-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.community-result-views__item:hover {
  background: color-mix(in srgb, var(--dw-bg-muted) 80%, transparent);
}
</style>
