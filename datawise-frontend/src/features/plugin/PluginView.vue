<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import {useI18n} from 'vue-i18n'
import type {PluginItem} from '@/core/types'
import {CollapsibleSection, DwCard, DwCheckbox, EmptyState, ModuleHeroSettingsMenu, ModulePageHeader, SearchInput, StatusPill, type ModuleHeroMenuItem} from '@/core/components'
import {DwIcon} from '@/core/icons'
import PluginDetailDialog from '@/features/plugin/components/PluginDetailDialog.vue'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {
    PLUGIN_REGISTRY,
    listPluginRequires,
    listPluginSurfaceIds,
    pluginHasUnmetRequires,
    pluginHasSurface,
    type PluginId,
} from '@/features/plugin/services/plugin-registry.service'
import type {PluginPresetId} from '@/features/plugin/services/plugin-preset.service'
import {
    findPluginPreset,
    listPresetChanges,
    pluginConflictsWithPreset,
    countPluginsConflictingWithPreset,
    recommendClosestPreset,
    suggestPresetForTeamRole,
    summarizePresetImpact,
} from '@/features/plugin/services/plugin-preset.service'
import {
    getPluginUsage,
    pluginUsageLastAtMs,
    pluginUsageTotal,
} from '@/features/plugin/services/plugin-usage.service'
import {
    markPresetAutoApplied,
    resolveFirstVisitAutoPreset,
} from '@/features/plugin/services/plugin-preset-auto.service'
import {useReferenceConflictBannerDismiss} from '@/features/plugin/composables/useReferenceConflictBannerDismiss'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useTeamStore} from '@/features/team/stores/team-store'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {PLUGIN_PRESET_DIFF_ANCHOR} from '@/features/plugin/services/plugin-navigation.service'
import '@/features/plugin/styles/plugin-view.css'

const CATEGORY_ORDER = ['ai', 'export', 'tool', 'datasource'] as const

const {t, te} = useI18n()
const pluginStore = usePluginStore()
const toast = useAppToast()
const teamStore = useTeamStore()
const appConfigStore = useAppConfigStore()
const filter = ref<'all' | 'enabled' | 'disabled'>('all')
const sortMode = ref<'default' | 'usage' | 'recent'>('default')
const usageRevision = ref(0)
const category = ref<'all' | PluginItem['category']>('all')
const surface = ref<'all' | string>('all')
const searchQuery = ref('')
const unmetRequiresOnly = ref(false)
const presetMismatchOnly = ref(false)
const detailPlugin = ref<PluginItem | null>(null)
const detailOpen = ref(false)
const configImportInputRef = ref<HTMLInputElement>()

const {highlightPluginId, pageNavigateIntent} = storeToRefs(pluginStore)

const surfaceOptions = listPluginSurfaceIds()
const presetIds: PluginPresetId[] = ['dba', 'readOnlyAnalysis', 'teamViewer', 'developer', 'minimal']
const referencePresetId = computed<PluginPresetId>({
  get: () => pluginStore.referencePresetId(),
  set: (id) => pluginStore.setReferencePresetId(id),
})
const viewerHintDismissed = ref(false)

const activeTeam = computed(
    () => teamStore.teams.find((team) => team.id === teamStore.activeTeamId) ?? null,
)
const suggestedTeamPreset = computed(() => suggestPresetForTeamRole(activeTeam.value?.role))
const showTeamViewerHint = computed(
    () => !viewerHintDismissed.value && suggestedTeamPreset.value === 'teamViewer',
)

const presetMismatchCount = computed(() => {
  const preset = findPluginPreset(referencePresetId.value)
  if (!preset) return 0
  return countPluginsConflictingWithPreset(preset, (id) => pluginStore.isEnabled(id))
})

const closestPresetMatch = computed(() =>
    recommendClosestPreset((id) => pluginStore.isEnabled(id)),
)

const showClosestPresetHint = computed(() => (closestPresetMatch.value?.conflicts ?? 0) > 0)

const presetDiffRows = computed(() => {
  const preset = findPluginPreset(referencePresetId.value)
  if (!preset) return []
  return listPresetChanges(preset, (id) => pluginStore.isEnabled(id))
})

const {
    visible: showReferenceConflictBanner,
    dismiss: dismissReferenceConflictBanner,
} = useReferenceConflictBannerDismiss(referencePresetId, presetMismatchCount)

const presetDiffPinned = ref(false)

const presetDiffSectionOpen = computed(
    () => presetDiffPinned.value || presetDiffRows.value.length > 0 || presetMismatchCount.value > 0,
)

function presetImpactSummary(presetId: PluginPresetId) {
  const preset = findPluginPreset(presetId)
  if (!preset) return null
  return summarizePresetImpact(preset, (id) => pluginStore.isEnabled(id))
}

function presetImpactCount(presetId: PluginPresetId): number {
  return presetImpactSummary(presetId)?.totalChanges ?? 0
}

function presetButtonTitle(presetId: PluginPresetId): string {
  const hint = t(`plugin.presets.${presetId}.hint`)
  const impact = presetImpactSummary(presetId)
  if (!impact || impact.totalChanges === 0) {
    return `${hint} · ${t('plugin.presets.impactNone')}`
  }
  return `${hint} · ${t('plugin.presets.impactSummary', {
    enable: impact.toEnable.length,
    disable: impact.toDisable.length,
  })}`
}

onMounted(() => {
  tryAutoApplyRolePreset()
  handlePageNavigateIntent(pageNavigateIntent.value)
})

watch(pageNavigateIntent, handlePageNavigateIntent)

function handlePageNavigateIntent(intent: 'none' | 'presetDiff') {
  if (intent !== 'presetDiff') return
  presetDiffPinned.value = true
  void nextTick(() => {
    document.getElementById(PLUGIN_PRESET_DIFF_ANCHOR)?.scrollIntoView({behavior: 'smooth', block: 'start'})
    pluginStore.clearPageNavigateIntent()
  })
}

function tryAutoApplyRolePreset() {
  const autoPreset = resolveFirstVisitAutoPreset(
      activeTeam.value?.role,
      appConfigStore.config.plugins?.enabled ?? {},
  )
  if (!autoPreset) return
  pluginStore.applyPreset(autoPreset)
  markPresetAutoApplied(autoPreset)
  viewerHintDismissed.value = true
  toast.success(t(`plugin.presets.${autoPreset}.autoApplied`))
}

function bumpUsageRevision() {
  usageRevision.value += 1
}

function pluginToggleCount(plugin: PluginItem): number {
  void usageRevision.value
  return pluginUsageTotal(getPluginUsage(plugin.id))
}

function pluginLastToggleAt(plugin: PluginItem): number {
  void usageRevision.value
  return pluginUsageLastAtMs(plugin.id)
}

const filtered = computed(() => {
  let list = pluginStore.items
  if (filter.value === 'enabled') list = list.filter((p) => p.enabled)
  if (filter.value === 'disabled') list = list.filter((p) => !p.enabled)
  if (category.value !== 'all') list = list.filter((p) => p.category === category.value)
  if (surface.value !== 'all') {
    list = list.filter((p) => pluginHasSurface(p.id as PluginId, surface.value))
  }
  if (unmetRequiresOnly.value) {
    list = list.filter((p) => hasUnmetRequires(p))
  }
  if (presetMismatchOnly.value) {
    list = list.filter((p) => conflictsWithReferencePreset(p))
  }
  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter((plugin) => matchesSearch(plugin, query))
  }
  if (sortMode.value === 'usage') {
    list = [...list].sort(
        (a, b) => pluginToggleCount(b) - pluginToggleCount(a) || pluginName(a).localeCompare(pluginName(b)),
    )
  } else if (sortMode.value === 'recent') {
    list = [...list].sort(
        (a, b) => pluginLastToggleAt(b) - pluginLastToggleAt(a) || pluginName(a).localeCompare(pluginName(b)),
    )
  }
  return list
})

const unmetRequiresCount = computed(
    () => pluginStore.items.filter((plugin) => hasUnmetRequires(plugin)).length,
)

function isEnabled(id: PluginId): boolean {
  return pluginStore.isEnabled(id)
}

function hasUnmetRequires(plugin: PluginItem): boolean {
  return pluginHasUnmetRequires(plugin, isEnabled)
}

function conflictsWithReferencePreset(plugin: PluginItem): boolean {
  const preset = findPluginPreset(referencePresetId.value)
  if (!preset) return false
  return pluginConflictsWithPreset(plugin.id as PluginId, preset, isEnabled)
}

function presetMismatchBadgeLabel(): string {
  return t('plugin.presets.mismatchBadge', {
    preset: t(`plugin.presets.${referencePresetId.value}.label`),
  })
}

function applyClosestPreset() {
  const match = closestPresetMatch.value
  if (!match) return
  referencePresetId.value = match.id
  applyPreset(match.id)
}

function matchesSearch(plugin: PluginItem, query: string): boolean {
  const fields = [
    plugin.id,
    plugin.name,
    plugin.description,
    pluginName(plugin),
    pluginDesc(plugin),
    ...pluginRequires(plugin).flatMap((reqId) => [reqId, requiredPluginLabel(reqId)]),
  ]
  return fields.some((value) => value.toLowerCase().includes(query))
}

function scrollToHighlightedPlugin(id: string | null) {
  if (!id) return
  void nextTick(() => {
    document.getElementById(`plugin-card-${id}`)?.scrollIntoView({behavior: 'smooth', block: 'center'})
    window.setTimeout(() => pluginStore.clearHighlight(), 3200)
  })
}

watch(highlightPluginId, scrollToHighlightedPlugin, {immediate: true})

const stats = computed(() => ({
  total: pluginStore.items.length,
  enabled: pluginStore.enabledCount,
}))

const enabledPercent = computed(() => {
  if (!stats.value.total) return 0
  return Math.round((stats.value.enabled / stats.value.total) * 100)
})

type PluginCardSize = 'hero' | 'wide' | 'tall' | 'standard' | 'compact'

/** Stable FNV-1a hash — same id always maps to the same “random” tile. */
function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Weighted size palette so the board looks irregular, not uniform. */
const CARD_SIZE_PALETTE: PluginCardSize[] = [
  'hero',
  'wide',
  'tall',
  'standard',
  'compact',
  'tall',
  'wide',
  'standard',
  'compact',
  'tall',
]

function pluginCardSize(plugin: PluginItem): PluginCardSize {
  // Keep warning tiles readable; everything else is seeded-random for a messy board.
  if (hasUnmetRequires(plugin) || conflictsWithReferencePreset(plugin)) return 'tall'
  return CARD_SIZE_PALETTE[hashString(plugin.id) % CARD_SIZE_PALETTE.length]!
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const next = [...items]
  let state = seed || 1
  for (let i = next.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = state % (i + 1)
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
  }
  return next
}

/** Shuffled order + varied spans (stable per current filter set). */
const boardTiles = computed(() => {
  const list = filtered.value
  const seed = hashString(list.map((plugin) => plugin.id).join('\0') || 'empty')
  return seededShuffle(list, seed).map((plugin) => ({
    plugin,
    size: pluginCardSize(plugin),
  }))
})

const hasAlerts = computed(
    () =>
        showTeamViewerHint.value
        || (showClosestPresetHint.value && Boolean(closestPresetMatch.value))
        || showReferenceConflictBanner.value,
)

function pluginName(plugin: PluginItem): string {
  const key = `plugin.items.${plugin.id}.name`
  return te(key) ? t(key) : plugin.name
}

function pluginDesc(plugin: PluginItem): string {
  const key = `plugin.items.${plugin.id}.description`
  return te(key) ? t(key) : plugin.description
}

function surfaces(plugin: PluginItem): string[] {
  const meta = PLUGIN_REGISTRY[plugin.id as PluginId]
  return meta?.surfaces ?? []
}

function pluginRequires(plugin: PluginItem): PluginId[] {
  return listPluginRequires(plugin.id as PluginId)
}

function requiredPluginLabel(id: PluginId): string {
  const key = `plugin.items.${id}.name`
  return te(key) ? t(key) : id
}

function tone(plugin: PluginItem): string {
  return PLUGIN_REGISTRY[plugin.id as PluginId]?.tone ?? 'violet'
}

function openPlugin(plugin: PluginItem) {
  pluginStore.openPluginTarget(plugin.id as PluginId)
}

function openDetail(plugin: PluginItem) {
  detailPlugin.value = plugin
  detailOpen.value = true
}

function closeDetail() {
  detailOpen.value = false
  detailPlugin.value = null
}

function onDetailToggle() {
  if (!detailPlugin.value) return
  const id = detailPlugin.value.id
  pluginStore.toggle(id)
  bumpUsageRevision()
  detailPlugin.value = pluginStore.items.find((item) => item.id === id) ?? null
}

function onDetailPluginUpdated(plugin: PluginItem | null) {
  detailPlugin.value = plugin
  bumpUsageRevision()
}

function dismissTeamViewerHint() {
  viewerHintDismissed.value = true
}

function applySuggestedTeamPreset() {
  const presetId = suggestedTeamPreset.value
  if (!presetId) return
  applyPreset(presetId)
  viewerHintDismissed.value = true
}

function onDetailOpenFeature() {
  if (!detailPlugin.value) return
  openPlugin(detailPlugin.value)
  closeDetail()
}

function onDetailOpenSettings() {
  if (!detailPlugin.value) return
  pluginStore.openPluginTarget(detailPlugin.value.id as PluginId)
  closeDetail()
}

function applyPreset(presetId: PluginPresetId) {
  pluginStore.applyPreset(presetId)
}

function applyReferencePreset() {
  pluginStore.alignToReferencePreset()
}

function scrollToPresetDiff() {
  presetDiffPinned.value = true
  void nextTick(() => {
    document.getElementById(PLUGIN_PRESET_DIFF_ANCHOR)?.scrollIntoView({behavior: 'smooth', block: 'start'})
  })
}

function focusRequiredPlugin(reqId: PluginId) {
  pluginStore.focusPlugin(reqId)
}

function enablePluginRequires(plugin: PluginItem) {
  const touched = pluginStore.satisfyPluginRequires(plugin.id as PluginId)
  if (touched.length) {
    bumpUsageRevision()
    toast.success(t('plugin.enableRequiresSuccess', {count: touched.length}))
  }
}

function exportPluginConfig() {
  pluginStore.exportPluginConfig()
  toast.success(t('plugin.config.exportSuccess'))
}

function triggerImportPluginConfig() {
  configImportInputRef.value?.click()
}

async function onImportPluginConfig(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const ok = pluginStore.importPluginConfig(text)
    if (ok) {
      bumpUsageRevision()
      toast.success(t('plugin.config.importSuccess'))
    } else {
      toast.error(t('plugin.config.importFailed'))
    }
  } catch {
    toast.error(t('plugin.config.importFailed'))
  }
}

function resetPluginConfig() {
  pluginStore.resetPluginOverrides()
}

const heroMenuItems = computed<ModuleHeroMenuItem[]>(() => [
  {
    id: 'export',
    label: t('plugin.config.export'),
    icon: 'export',
  },
  {
    id: 'import',
    label: t('plugin.config.import'),
    icon: 'save',
  },
  {
    id: 'reset',
    label: t('plugin.config.reset'),
    icon: 'rollback',
    dividerBefore: true,
  },
])

function onHeroMenuSelect(id: string) {
  if (id === 'export') {
    exportPluginConfig()
    return
  }
  if (id === 'import') {
    triggerImportPluginConfig()
    return
  }
  if (id === 'reset') {
    resetPluginConfig()
  }
}

async function onPluginToggle(plugin: PluginItem) {
  pluginStore.toggle(plugin.id)
  bumpUsageRevision()
}
</script>

<template>
  <div class="module-page module-page--scroll plugin-page">
    <div class="mp-page-wrap plugin-page__wrap">
      <ModulePageHeader
          content-class="plugin-hero"
          :title="t('plugin.title')"
          :eyebrow="t('plugin.layout.eyebrow')"
          :subtitle="t('plugin.subtitle')"
          :hint="t('plugin.persistHint')"
      >
        <template #settings>
          <ModuleHeroSettingsMenu
              :ariaLabel="t('plugin.settingsMenu.aria')"
              :items="heroMenuItems"
              @select="onHeroMenuSelect"
          />
        </template>
        <input
            ref="configImportInputRef"
            type="file"
            accept="application/json,.json"
            hidden
            @change="onImportPluginConfig"
        />
      </ModulePageHeader>

      <section class="mp-status" aria-label="plugin status">
        <div class="mp-status__item">
          <span class="mp-status__label">{{ t('plugin.enabled') }}</span>
          <strong class="mp-status__value">{{ stats.enabled }}</strong>
        </div>
        <div class="mp-status__item">
          <span class="mp-status__label">{{ t('plugin.total') }}</span>
          <strong class="mp-status__value">{{ stats.total }}</strong>
        </div>
        <div
            v-if="presetMismatchCount > 0"
            class="mp-status__item mp-status__item--warn"
        >
          <span class="mp-status__label">{{ t('plugin.layout.presetMismatch') }}</span>
          <strong class="mp-status__value">{{ presetMismatchCount }}</strong>
        </div>
        <div v-else class="mp-status__item">
          <span class="mp-status__label">{{ t('plugin.layout.referencePreset') }}</span>
          <strong class="mp-status__value mp-status__value--sm">{{ t(`plugin.presets.${referencePresetId}.label`) }}</strong>
        </div>
        <div class="mp-status__item mp-status__item--grow">
          <div class="mp-status__readiness-row">
            <span class="mp-status__label">{{ t('plugin.layout.enabledRate') }}</span>
            <strong class="mp-status__value mp-status__value--sm">{{ enabledPercent }}%</strong>
          </div>
          <div class="mp-status__bar" aria-hidden="true">
            <span :style="{width: `${enabledPercent}%`}"/>
          </div>
        </div>
      </section>

      <div v-if="hasAlerts" class="plugin-alerts">
        <div v-if="showTeamViewerHint" class="plugin-alert plugin-alert--info">
          <span class="plugin-alert__icon" aria-hidden="true">
            <DwIcon name="user" size="lg" :stroke-width="1.6"/>
          </span>
          <div class="plugin-alert__body">
            <p class="plugin-alert__text">{{ t('plugin.teamViewerHint') }}</p>
          </div>
          <div class="plugin-alert__actions">
            <button class="dw-text-btn dw-text-btn--accent" type="button" @click="applySuggestedTeamPreset">
              {{ t('plugin.presets.teamViewer.label') }}
            </button>
            <button class="dw-text-btn" type="button" @click="dismissTeamViewerHint">
              {{ t('plugin.teamViewerDismiss') }}
            </button>
          </div>
        </div>

        <div v-if="showClosestPresetHint && closestPresetMatch" class="plugin-alert plugin-alert--info">
          <span class="plugin-alert__icon" aria-hidden="true">
            <DwIcon name="star" size="lg" :stroke-width="1.6"/>
          </span>
          <div class="plugin-alert__body">
            <p class="plugin-alert__text">
              {{ t('plugin.presets.closestMatch', {
                preset: t(`plugin.presets.${closestPresetMatch.id}.label`),
                conflicts: closestPresetMatch.conflicts,
              }) }}
            </p>
          </div>
          <div class="plugin-alert__actions">
            <button class="dw-text-btn dw-text-btn--accent" type="button" @click="applyClosestPreset">
              {{ t('plugin.presets.closestApply', {
                preset: t(`plugin.presets.${closestPresetMatch.id}.label`),
              }) }}
            </button>
            <button
                class="dw-text-btn"
                type="button"
                @click="referencePresetId = closestPresetMatch.id"
            >
              {{ t('plugin.presets.closestUseAsReference') }}
            </button>
          </div>
        </div>

        <div v-if="showReferenceConflictBanner" class="plugin-alert plugin-alert--warn">
          <span class="plugin-alert__icon" aria-hidden="true">
            <DwIcon name="alert-triangle" size="lg" :stroke-width="1.6"/>
          </span>
          <div class="plugin-alert__body">
            <p class="plugin-alert__text">
              {{ t('plugin.presets.referenceConflictBanner', {
                preset: t(`plugin.presets.${referencePresetId}.label`),
                count: presetMismatchCount,
              }) }}
            </p>
          </div>
          <div class="plugin-alert__actions">
            <button class="dw-text-btn dw-text-btn--accent" type="button" @click="applyReferencePreset">
              {{ t('plugin.presets.referenceConflictAlignAll', { count: presetMismatchCount }) }}
            </button>
            <button class="dw-text-btn" type="button" @click="scrollToPresetDiff">
              {{ t('plugin.presets.referenceConflictViewDiff') }}
            </button>
            <button class="dw-text-btn" type="button" @click="dismissReferenceConflictBanner">
              {{ t('plugin.presets.referenceConflictDismiss') }}
            </button>
          </div>
        </div>
      </div>

      <div class="plugin-layout">
        <aside class="plugin-sidebar">
          <div class="plugin-panel plugin-panel--accent">
            <div class="plugin-panel__head">
              <div>
                <h2 class="plugin-panel__title">{{ t('plugin.layout.referencePreset') }}</h2>
                <p class="plugin-panel__sub">{{ t('plugin.presets.diffDescription') }}</p>
              </div>
              <StatusPill v-if="presetMismatchCount" variant="warn">{{ presetMismatchCount }}</StatusPill>
            </div>
            <div class="plugin-reference-pills">
              <button
                  v-for="presetId in presetIds"
                  :key="`ref-${presetId}`"
                  class="dw-text-btn"
                  :class="{ 'is-active': referencePresetId === presetId }"
                  type="button"
                  @click="referencePresetId = presetId"
              >
                {{ t(`plugin.presets.${presetId}.label`) }}
              </button>
            </div>
            <div class="plugin-reference-meta">
              <StatusPill variant="neutral">
                {{ t(`plugin.presets.${referencePresetId}.label`) }}
              </StatusPill>
              <button
                  v-if="presetMismatchCount"
                  class="dw-text-btn dw-text-btn--accent"
                  type="button"
                  @click="applyReferencePreset"
              >
                {{ t('plugin.presets.referenceConflictAlignAll', { count: presetMismatchCount }) }}
              </button>
            </div>
            <div class="plugin-panel__actions">
              <button class="dw-text-btn" type="button" @click="scrollToPresetDiff">
                {{ t('plugin.presets.referenceConflictViewDiff') }}
              </button>
            </div>
          </div>

          <div class="plugin-panel">
            <div class="plugin-panel__head">
              <div>
                <h2 class="plugin-panel__title">{{ t('plugin.presets.title') }}</h2>
                <p class="plugin-panel__sub">{{ t('plugin.layout.presetHint') }}</p>
              </div>
            </div>
            <div class="plugin-preset-grid">
              <button
                  v-for="presetId in presetIds"
                  :key="presetId"
                  class="plugin-preset-card"
                  type="button"
                  :title="presetButtonTitle(presetId)"
                  @click="applyPreset(presetId)"
              >
                <div class="plugin-preset-card__row">
                  <span class="plugin-preset-card__label">{{ t(`plugin.presets.${presetId}.label`) }}</span>
                  <StatusPill v-if="presetImpactCount(presetId)" variant="neutral">
                    {{ presetImpactCount(presetId) }}
                  </StatusPill>
                </div>
                <span class="plugin-preset-card__hint">{{ t(`plugin.presets.${presetId}.hint`) }}</span>
              </button>
            </div>
          </div>

          <div class="plugin-panel">
            <div class="plugin-panel__head">
              <h2 class="plugin-panel__title">{{ t('plugin.layout.config') }}</h2>
            </div>
            <div class="plugin-config-actions">
              <button class="dw-text-btn" type="button" @click="resetPluginConfig">
                {{ t('plugin.config.reset') }}
              </button>
            </div>
          </div>

          <section :id="PLUGIN_PRESET_DIFF_ANCHOR" class="plugin-connectors plugin-presets-diff">
            <CollapsibleSection
                :title="t('plugin.presets.diffTitle')"
                :description="t('plugin.presets.diffDescription')"
                :default-open="presetDiffSectionOpen"
            >
              <template #badge>
                <StatusPill v-if="presetDiffRows.length" variant="neutral">{{ presetDiffRows.length }}</StatusPill>
              </template>

              <div class="plugin-presets-diff__body">
                <EmptyState
                    v-if="!presetDiffRows.length"
                    embedded
                    :title="t('plugin.presets.diffEmpty')"
                    :hint="t('plugin.presets.diffEmptyHint')"
                />
                <ul v-else class="plugin-presets-diff__list">
                  <li
                      v-for="change in presetDiffRows"
                      :key="`${change.action}:${change.id}`"
                      class="plugin-presets-diff__item"
                  >
                    <span class="plugin-presets-diff__name">{{ requiredPluginLabel(change.id) }}</span>
                    <StatusPill :variant="change.action === 'enable' ? 'success' : 'warn'">
                      {{ change.action === 'enable' ? t('plugin.presets.diffEnable') : t('plugin.presets.diffDisable') }}
                    </StatusPill>
                    <span class="plugin-presets-diff__id">{{ change.id }}</span>
                  </li>
                </ul>
                <div v-if="presetDiffRows.length" class="plugin-presets-diff__actions">
                  <button
                      class="dw-text-btn dw-text-btn--accent"
                      type="button"
                      @click="applyReferencePreset"
                  >
                    {{ t('plugin.presets.diffApply', { preset: t(`plugin.presets.${referencePresetId}.label`) }) }}
                  </button>
                </div>
              </div>
            </CollapsibleSection>
          </section>
        </aside>

        <main class="plugin-main">
          <div class="mp-region mp-region--toolbar plugin-filter-dock">
            <div class="plugin-filter-dock__search-row">
              <SearchInput
                  v-model="searchQuery"
                  class="plugin-filter-dock__search"
                  :placeholder="t('plugin.searchPlaceholder')"
              >
                <template #suffix>
                  {{ t('plugin.layout.showing', { count: filtered.length, total: stats.total }) }}
                </template>
              </SearchInput>
            </div>

            <div class="plugin-filter-dock__group">
              <span class="plugin-filter-dock__label">{{ t('plugin.layout.status') }}</span>
              <div class="dw-segment dw-segment--wrap">
                <button
                    v-for="item in ['all', 'enabled', 'disabled'] as const"
                    :key="item"
                    class="dw-segment__btn"
                    :class="{ 'is-active': filter === item }"
                    type="button"
                    @click="filter = item"
                >
                  {{
                    item === 'all' ? t('plugin.filterAll') : item === 'enabled' ? t('plugin.filterEnabled') : t('plugin.filterDisabled')
                  }}
                </button>
                <button
                    class="dw-segment__btn"
                    :class="{ 'is-active': unmetRequiresOnly }"
                    type="button"
                    @click="unmetRequiresOnly = !unmetRequiresOnly"
                >
                  {{ t('plugin.filterUnmetRequires') }}
                  <StatusPill v-if="unmetRequiresCount" variant="warn">{{ unmetRequiresCount }}</StatusPill>
                </button>
                <button
                    class="dw-segment__btn"
                    :class="{ 'is-active': presetMismatchOnly }"
                    type="button"
                    @click="presetMismatchOnly = !presetMismatchOnly"
                >
                  {{ t('plugin.filterPresetMismatch', { preset: t(`plugin.presets.${referencePresetId}.label`) }) }}
                  <StatusPill v-if="presetMismatchCount" variant="warn">{{ presetMismatchCount }}</StatusPill>
                </button>
              </div>
            </div>

            <div class="plugin-filter-dock__group">
              <span class="plugin-filter-dock__label">{{ t('plugin.layout.category') }}</span>
              <div class="dw-segment dw-segment--wrap">
                <button
                    class="dw-segment__btn"
                    :class="{ 'is-active': category === 'all' }"
                    type="button"
                    @click="category = 'all'"
                >
                  {{ t('plugin.filterAll') }}
                </button>
                <button
                    v-for="cat in CATEGORY_ORDER"
                    :key="cat"
                    class="dw-segment__btn"
                    :class="{ 'is-active': category === cat }"
                    type="button"
                    @click="category = cat"
                >
                  {{ t(`plugin.category.${cat}`) }}
                </button>
              </div>
            </div>

            <div class="plugin-filter-dock__group">
              <span class="plugin-filter-dock__label">{{ t('plugin.layout.more') }}</span>
              <div class="dw-segment dw-segment--wrap">
                <button
                    class="dw-segment__btn"
                    :class="{ 'is-active': surface === 'all' }"
                    type="button"
                    @click="surface = 'all'"
                >
                  {{ t('plugin.filterAll') }}
                </button>
                <button
                    v-for="item in surfaceOptions"
                    :key="item"
                    class="dw-segment__btn"
                    :class="{ 'is-active': surface === item }"
                    type="button"
                    @click="surface = item"
                >
                  {{ t(`plugin.surfaces.${item}`) }}
                </button>
                <span class="plugin-filter-dock__label">{{ t('plugin.sortBy') }}</span>
                <button
                    class="dw-segment__btn"
                    :class="{ 'is-active': sortMode === 'default' }"
                    type="button"
                    @click="sortMode = 'default'"
                >
                  {{ t('plugin.sortDefault') }}
                </button>
                <button
                    class="dw-segment__btn"
                    :class="{ 'is-active': sortMode === 'usage' }"
                    type="button"
                    @click="sortMode = 'usage'"
                >
                  {{ t('plugin.sortByUsage') }}
                </button>
                <button
                    class="dw-segment__btn"
                    :class="{ 'is-active': sortMode === 'recent' }"
                    type="button"
                    @click="sortMode = 'recent'"
                >
                  {{ t('plugin.sortByRecent') }}
                </button>
              </div>
            </div>
          </div>

          <div class="plugin-card-grid">
        <DwCard
            v-for="tile in boardTiles"
            :id="`plugin-card-${tile.plugin.id}`"
            :key="tile.plugin.id"
            variant="feature"
            tag="article"
            class="plugin-card"
            :class="[
              `mp-tone-${tone(tile.plugin)}`,
              `plugin-card--${tile.size}`,
              {
                'is-enabled': tile.plugin.enabled,
                'is-highlighted': highlightPluginId === tile.plugin.id,
                'has-unmet-requires': hasUnmetRequires(tile.plugin),
                'preset-mismatch': conflictsWithReferencePreset(tile.plugin),
              },
            ]"
        >
          <header class="plugin-card__head">
            <div class="plugin-card__head-main">
              <div class="mp-feature-card__title-row">
                <h2 class="mp-feature-card__title">{{ pluginName(tile.plugin) }}</h2>
                <span class="mp-feature-card__ver">v{{ tile.plugin.version }}</span>
              </div>
              <div class="plugin-card__meta">
                <span class="mp-feature-card__cat">{{ t(`plugin.category.${tile.plugin.category}`) }}</span>
                <StatusPill v-if="conflictsWithReferencePreset(tile.plugin)" variant="warn">
                  {{ presetMismatchBadgeLabel() }}
                </StatusPill>
                <StatusPill v-if="hasUnmetRequires(tile.plugin)" variant="warn">
                  {{ t('plugin.unmetRequiresBadge') }}
                </StatusPill>
                <StatusPill v-if="pluginToggleCount(tile.plugin)" variant="neutral">
                  {{ t('plugin.usage.toggleBadge', {count: pluginToggleCount(tile.plugin)}) }}
                </StatusPill>
              </div>
            </div>
            <div class="plugin-card__toggle-wrap">
              <DwCheckbox
                  class="mp-switch"
                  :model-value="tile.plugin.enabled"
                  @update:model-value="onPluginToggle(tile.plugin)"
              >
                {{ tile.plugin.enabled ? t('plugin.enabled') : t('plugin.disabled') }}
              </DwCheckbox>
            </div>
          </header>

          <p class="mp-feature-card__desc">{{ pluginDesc(tile.plugin) }}</p>

          <div v-if="surfaces(tile.plugin).length" class="mp-feature-card__surfaces">
            <span class="mp-feature-card__surfaces-label">{{ t('plugin.surfacesTitle') }}</span>
            <div class="mp-feature-card__chips">
              <span
                  v-for="surfaceId in surfaces(tile.plugin)"
                  :key="surfaceId"
                  class="mp-chip"
              >
                {{ t(`plugin.surfaces.${surfaceId}`) }}
              </span>
            </div>
          </div>

          <div v-if="pluginRequires(tile.plugin).length" class="mp-feature-card__requires">
            <span class="mp-feature-card__surfaces-label">{{ t('plugin.detail.requires') }}</span>
            <div class="mp-feature-card__chips">
              <button
                  v-for="reqId in pluginRequires(tile.plugin)"
                  :key="reqId"
                  type="button"
                  class="mp-chip mp-chip--hint mp-chip--link"
                  :class="{ 'is-disabled-req': !isEnabled(reqId) }"
                  @click="focusRequiredPlugin(reqId)"
              >
                {{ requiredPluginLabel(reqId) }}
              </button>
            </div>
          </div>

          <footer class="plugin-card__foot">
            <span class="mp-feature-card__author">{{ tile.plugin.author }}</span>
            <div class="plugin-card__foot-actions">
              <button
                  v-if="hasUnmetRequires(tile.plugin)"
                  class="mp-feature-card__detail"
                  type="button"
                  @click="enablePluginRequires(tile.plugin)"
              >
                {{ t('plugin.enableRequires') }}
              </button>
              <button
                  class="mp-feature-card__detail"
                  type="button"
                  @click="openDetail(tile.plugin)"
              >
                {{ t('plugin.detail.action') }}
              </button>
              <button
                  class="mp-feature-card__open"
                  type="button"
                  :disabled="!tile.plugin.enabled"
                  @click="openPlugin(tile.plugin)"
              >
                {{ t('plugin.openFeature') }}
              </button>
            </div>
          </footer>
        </DwCard>

            <EmptyState
                v-if="!boardTiles.length"
                class="mp-empty plugin-empty"
                embedded
                compact
                :title="t('plugin.empty')"
            />
          </div>
        </main>
      </div>
    </div>

    <PluginDetailDialog
        :open="detailOpen"
        :plugin="detailPlugin"
        :reference-preset-id="referencePresetId"
        @close="closeDetail"
        @toggle="onDetailToggle"
        @open-feature="onDetailOpenFeature"
        @open-settings="onDetailOpenSettings"
        @plugin-updated="onDetailPluginUpdated"
    />
  </div>
</template>
