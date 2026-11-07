<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {ConfirmDialog, DwButton, DwInlineAlert, EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import type {RuntimeOverview} from '@/features/datasource/types/datasource.types'
import {
    deleteCachedDriver,
    deleteCachedDriverBundle,
    deleteDriverFamily,
    fetchRuntimeOverview,
    formatRuntimeBytes,
    importRuntimeOfflineZip,
    installJdbcDriver,
    pickRuntimeOfflineZip,
    refreshDriverCatalog,
} from '@/features/settings/services/runtime-settings.service'
import {
    collectFamilyDeleteTargets,
    groupJdbcDrivers,
    mapCatalogFamilies,
    type DriverFamilyGroup,
    type DriverVersionEntry,
} from '@/features/settings/services/driver-package.service'
import {
    browseJreHome,
    loadJrePreferences,
    saveJrePreferences,
} from '@/features/settings/services/jre-preferences.service'
import type {JreSource} from '@/features/settings/services/jre-preferences.types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const DETAIL_JAR_PREVIEW = 8

const {t} = useI18n()
const layout = useLayoutStore()
const auth = useAuthStore()
const desktopApp = isDesktopApp()
const {
    open: confirmOpen,
    title: confirmTitle,
    message: confirmMessage,
    confirmLabel,
    confirmVariant,
    ask: askConfirm,
    onConfirm: onConfirmDialog,
    onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()

const loading = ref(false)
const busyKey = ref<string | null>(null)
const overview = ref<RuntimeOverview | null>(null)
const driverFamilies = ref<DriverFamilyGroup[]>([])
const orphanFamilies = ref<DriverFamilyGroup[]>([])
const expandedFamilies = ref<Set<string>>(new Set())
const expandedVersions = ref<Set<string>>(new Set())
const lastError = ref<string | null>(null)

const jreSource = ref<JreSource>('bundled')
const jreCustomHome = ref('')
const jreSaving = ref(false)
const jreDirty = ref(false)
const jreMessage = ref<string | null>(null)

const canManageDrivers = computed(() => auth.isAdmin)
const installedCount = computed(() =>
    driverFamilies.value.filter((f) => f.status !== 'missing').length,
)

const jreSources: Array<{id: JreSource; labelKey: string; hintKey: string}> = [
    {id: 'bundled', labelKey: 'settings.runtime.jreSourceBundled', hintKey: 'settings.runtime.jreSourceBundledHint'},
    {id: 'system', labelKey: 'settings.runtime.jreSourceSystem', hintKey: 'settings.runtime.jreSourceSystemHint'},
    {id: 'custom', labelKey: 'settings.runtime.jreSourceCustom', hintKey: 'settings.runtime.jreSourceCustomHint'},
]

async function refresh() {
    if (loading.value) return
    loading.value = true
    lastError.value = null
    try {
        const [nextOverview, catalog] = await Promise.all([
            fetchRuntimeOverview(),
            refreshDriverCatalog(),
        ])
        overview.value = nextOverview
        driverFamilies.value = mapCatalogFamilies(catalog.families ?? [])
        orphanFamilies.value = groupJdbcDrivers(catalog.orphans ?? [])
        if (desktopApp) {
            const prefs = await loadJrePreferences()
            jreSource.value = prefs.source
            jreCustomHome.value = prefs.customHome ?? ''
            jreDirty.value = false
        }
    } catch (err) {
        lastError.value = resolveCaughtApiErrorMessage(err, t, 'settings.ai.errors.requestFailed')
    } finally {
        loading.value = false
    }
}

function markJreDirty() {
    jreDirty.value = true
    jreMessage.value = null
}

async function browseCustomJre() {
    const path = await browseJreHome()
    if (!path) return
    jreCustomHome.value = path
    jreSource.value = 'custom'
    markJreDirty()
}

async function saveJrePrefs() {
    if (!desktopApp || jreSaving.value) return
    jreSaving.value = true
    jreMessage.value = null
    try {
        await saveJrePreferences({
            source: jreSource.value,
            customHome: jreSource.value === 'custom' ? jreCustomHome.value.trim() || null : null,
        })
        jreDirty.value = false
        jreMessage.value = t('settings.runtime.jreSavedRestart')
        layout.showSuccessToast(t('settings.runtime.jreSaved'))
    } catch (err) {
        layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'settings.runtime.jreSaveFailed'))
    } finally {
        jreSaving.value = false
    }
}

function toggleFamily(id: string) {
    const next = new Set(expandedFamilies.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedFamilies.value = next
}

function toggleVersionDetail(id: string) {
    const next = new Set(expandedVersions.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedVersions.value = next
}

function statusLabel(status: DriverFamilyGroup['status']): string {
    if (status === 'loaded') return t('settings.runtime.statusLoaded')
    if (status === 'installed') return t('settings.runtime.statusInstalled')
    return t('settings.runtime.statusMissing')
}

function deliveryLabel(delivery: DriverFamilyGroup['delivery']): string {
    if (delivery === 'core') return t('settings.runtime.deliveryCore')
    if (delivery === 'sidecar') return t('settings.runtime.deliverySidecar')
    return t('settings.runtime.deliveryOnDemand')
}

async function importOfflineSidecar() {
    if (!canManageDrivers.value || busyKey.value) return
    let path = await pickRuntimeOfflineZip()
    if (!path && !desktopApp) {
        path = window.prompt(t('settings.runtime.importOfflinePathPrompt'))?.trim() || null
    }
    if (!path) return
    busyKey.value = 'import-offline'
    lastError.value = null
    try {
        const result = await importRuntimeOfflineZip(path)
        layout.showSuccessToast(result.message || t('settings.runtime.importOfflineDone'))
        await refresh()
    } catch (err) {
        lastError.value = resolveCaughtApiErrorMessage(err, t, 'settings.runtime.importOfflineFailed')
        layout.showErrorToast(lastError.value)
    } finally {
        busyKey.value = null
    }
}

function versionSummary(family: DriverFamilyGroup): string {
    if (family.status === 'missing') {
        return family.activeVersion
            ? t('settings.runtime.catalogVersion', {version: family.activeVersion})
            : '—'
    }
    if (family.versionCount <= 1) {
        return family.activeVersion ? `v${family.activeVersion}` : '—'
    }
    return t('settings.runtime.versionSummary', {
        count: family.versionCount,
        latest: family.activeVersion ?? '—',
    })
}

async function installFamily(family: DriverFamilyGroup) {
    if (!family.defaultMaven || !family.driverClass || busyKey.value) return
    busyKey.value = `install:${family.id}`
    try {
        await installJdbcDriver(family.defaultMaven, family.driverClass)
        layout.showSuccessToast(t('settings.runtime.driverInstalled'))
        await refresh()
    } catch (err) {
        layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'settings.runtime.driverInstallFailed'))
    } finally {
        busyKey.value = null
    }
}

async function removeVersion(version: DriverVersionEntry) {
    if (!canManageDrivers.value || busyKey.value) return
    const confirmed = await askConfirm({
        title: t('settings.runtime.deleteDriver'),
        message: t('settings.runtime.deleteDriverConfirm', {
            name: version.version ? `v${version.version}` : version.id,
        }),
        confirmLabel: t('settings.runtime.deleteDriver'),
    })
    if (!confirmed) return
    busyKey.value = version.id
    try {
        if (version.kind === 'bundle' && version.bundleDir) {
            await deleteCachedDriverBundle(version.bundleDir)
        } else if (version.primaryPath) {
            await deleteCachedDriver(version.primaryPath)
        } else {
            for (const jar of version.jars) {
                await deleteCachedDriver(jar.relativePath)
            }
        }
        layout.showSuccessToast(t('settings.runtime.driverDeleted'))
        await refresh()
    } catch (err) {
        layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'settings.runtime.driverDeleteFailed'))
    } finally {
        busyKey.value = null
    }
}

async function removeFamily(family: DriverFamilyGroup) {
    if (!canManageDrivers.value || busyKey.value) return
    const confirmed = await askConfirm({
        title: t('settings.runtime.deleteDriver'),
        message: t('settings.runtime.deleteDriverFamilyConfirm', {name: family.label || family.id}),
        confirmLabel: t('settings.runtime.deleteDriver'),
    })
    if (!confirmed) return
    busyKey.value = family.id
    try {
        if (family.defaultMaven) {
            await deleteDriverFamily(family.id)
        } else {
            const {bundles, jars} = collectFamilyDeleteTargets(family)
            for (const dir of bundles) {
                await deleteCachedDriverBundle(dir)
            }
            for (const path of jars) {
                await deleteCachedDriver(path)
            }
        }
        layout.showSuccessToast(t('settings.runtime.driverDeleted'))
        await refresh()
    } catch (err) {
        layout.showErrorToast(resolveCaughtApiErrorMessage(err, t, 'settings.runtime.driverDeleteFailed'))
    } finally {
        busyKey.value = null
    }
}

onMounted(() => {
    void refresh()
})
</script>

<template>
  <SettingsPageShell
      :title="t('settings.runtime.title')"
      :subtitle="t('settings.runtime.subtitle')"
      width="wide"
  >
    <template #actions>
      <div class="runtime-actions">
        <DwButton size="sm" variant="secondary" :disabled="loading" @click="refresh">
          <DwIcon name="refresh" size="sm" :stroke-width="1.8"/>
          {{ loading ? t('settings.runtime.refreshing') : t('settings.runtime.refresh') }}
        </DwButton>
      </div>
    </template>

    <DwInlineAlert v-if="lastError" variant="error" density="banner" class="runtime-alert">
      {{ lastError }}
    </DwInlineAlert>

    <template v-if="overview">
      <section class="runtime-status" aria-label="runtime status">
        <div class="runtime-status__item">
          <span class="runtime-status__label">{{ t('settings.runtime.jreTitle') }}</span>
          <strong class="runtime-status__value">
            {{ overview.jre.version || '—' }}
            <span class="runtime-status__muted">· {{ overview.jre.vendor || '—' }}</span>
          </strong>
          <span class="runtime-status__meta runtime-mono" :title="overview.jre.home">
            {{ overview.jre.source || '—' }} · {{ overview.jre.home || '—' }}
          </span>
        </div>
        <div class="runtime-status__item">
          <span class="runtime-status__label">{{ t('settings.runtime.packagingTitle') }}</span>
          <strong class="runtime-status__value">
            {{ overview.packaging?.profile || '—' }}
          </strong>
          <span class="runtime-status__meta">
            {{ t('settings.runtime.packagingConnectors', {mode: overview.packaging?.connectors || '—'}) }}
            · {{ t('settings.runtime.packagingDrivers', {mode: overview.packaging?.drivers || '—'}) }}
          </span>
        </div>
        <div class="runtime-status__item">
          <span class="runtime-status__label">{{ t('settings.runtime.connectorsTitle') }}</span>
          <strong class="runtime-status__value">
            {{ overview.connectors.installed }}
            <span class="runtime-status__muted">/ {{ overview.connectors.catalogTotal }}</span>
          </strong>
          <span class="runtime-status__meta">
            {{ formatRuntimeBytes(overview.connectors.pluginsBytes) }}
            <template v-if="overview.connectors.failures.length">
              · {{ t('settings.runtime.connectorFailures', {count: overview.connectors.failures.length}) }}
            </template>
          </span>
        </div>
        <div class="runtime-status__item">
          <span class="runtime-status__label">{{ t('settings.runtime.driversTitle') }}</span>
          <strong class="runtime-status__value">
            {{ t('settings.runtime.driversInstalledSummary', {
              installed: installedCount,
              total: driverFamilies.length,
            }) }}
          </strong>
          <span class="runtime-status__meta">
            {{ formatRuntimeBytes(overview.drivers.totalBytes) }}
            · {{ t('settings.runtime.driversJarTotal', {count: overview.drivers.cachedJars}) }}
          </span>
        </div>
        <div class="runtime-status__item">
          <span class="runtime-status__label">{{ t('settings.runtime.workspaceTitle') }}</span>
          <strong class="runtime-status__value">{{ formatRuntimeBytes(overview.workspace.diskUsageBytes) }}</strong>
          <span class="runtime-status__meta runtime-mono" :title="overview.workspace.configDir">
            {{ overview.workspace.configDir }}
          </span>
        </div>
      </section>

      <section v-if="desktopApp" class="runtime-library runtime-jre" aria-label="jre preferences">
        <header class="runtime-library__head">
          <div>
            <h3>{{ t('settings.runtime.jreConfigTitle') }}</h3>
            <p>{{ t('settings.runtime.jreConfigHint') }}</p>
          </div>
          <div class="runtime-jre__actions">
            <DwButton
                size="sm"
                variant="secondary"
                disabled
                :title="t('settings.runtime.jreDownloadStub')"
                :aria-label="t('settings.runtime.jreDownloadStub')"
            >
              {{ t('settings.runtime.jreDownload') }}
            </DwButton>
            <DwButton size="sm" :disabled="!jreDirty || jreSaving" @click="saveJrePrefs">
              {{ jreSaving ? t('settings.runtime.jreSaving') : t('settings.runtime.jreSave') }}
            </DwButton>
          </div>
        </header>
        <DwInlineAlert v-if="jreMessage" variant="info" density="banner" class="runtime-jre__alert">
          {{ jreMessage }}
        </DwInlineAlert>
        <div class="runtime-jre__options" role="radiogroup">
          <label
              v-for="option in jreSources"
              :key="option.id"
              class="runtime-jre__option"
              :class="{'is-active': jreSource === option.id}"
          >
            <input
                v-model="jreSource"
                type="radio"
                name="jre-source"
                :value="option.id"
                @change="markJreDirty"
            >
            <span>
              <strong>{{ t(option.labelKey) }}</strong>
              <span class="runtime-jre__hint">{{ t(option.hintKey) }}</span>
            </span>
          </label>
        </div>
        <div v-if="jreSource === 'custom'" class="runtime-jre__custom">
          <input
              v-model="jreCustomHome"
              class="runtime-jre__input runtime-mono"
              type="text"
              :placeholder="t('settings.runtime.jreCustomPlaceholder')"
              @input="markJreDirty"
          >
          <DwButton size="sm" variant="secondary" @click="browseCustomJre">
            {{ t('settings.runtime.jreBrowse') }}
          </DwButton>
        </div>
      </section>

      <section class="runtime-library">
        <header class="runtime-library__head">
          <div>
            <h3>{{ t('settings.runtime.driverListTitle') }}</h3>
            <p>{{ t('settings.runtime.driverListHint') }}</p>
            <p class="runtime-library__sidecar-hint">{{ t('settings.runtime.importOfflineHint') }}</p>
          </div>
          <DwButton
              v-if="canManageDrivers"
              size="sm"
              variant="secondary"
              :disabled="busyKey === 'import-offline'"
              @click="importOfflineSidecar"
          >
            {{ busyKey === 'import-offline'
              ? t('settings.runtime.importOfflineBusy')
              : t('settings.runtime.importOffline') }}
          </DwButton>
        </header>

        <EmptyState
            v-if="!driverFamilies.length"
            embedded
            compact
            class="runtime-empty"
            :title="t('settings.runtime.noDrivers')"
        />

        <ul v-else class="driver-list" role="list">
          <li
              v-for="family in driverFamilies"
              :key="family.id"
              class="driver-family"
              :class="{
                'driver-family--open': expandedFamilies.has(family.id),
                'driver-family--missing': family.status === 'missing',
              }"
          >
            <div class="driver-family__row">
              <button
                  type="button"
                  class="driver-family__toggle"
                  :aria-expanded="expandedFamilies.has(family.id)"
                  :disabled="family.status === 'missing'"
                  @click="family.status !== 'missing' && toggleFamily(family.id)"
              >
                <DwIcon
                    v-if="family.status !== 'missing'"
                    :name="expandedFamilies.has(family.id) ? 'chevron-down' : 'chevron-right'"
                    size="md"
                    :stroke-width="2"
                />
                <span v-else class="driver-family__spacer"/>
                <span class="driver-family__name">{{ family.label }}</span>
                <span
                    v-if="family.delivery !== 'core'"
                    class="driver-family__delivery"
                    :class="`is-${family.delivery}`"
                    :title="deliveryLabel(family.delivery)"
                >
                  {{ deliveryLabel(family.delivery) }}
                </span>
              </button>

              <span class="driver-family__version">{{ versionSummary(family) }}</span>
              <span class="driver-family__files">
                <template v-if="family.status === 'missing'">—</template>
                <template v-else>{{ t('settings.runtime.jarCount', {count: family.jarCount}) }}</template>
              </span>
              <span class="driver-family__size">
                {{ family.status === 'missing' ? '—' : formatRuntimeBytes(family.sizeBytes) }}
              </span>
              <span
                  class="driver-family__badge"
                  :class="{
                    'is-on': family.status === 'loaded',
                    'is-off': family.status === 'installed',
                    'is-missing': family.status === 'missing',
                  }"
              >
                {{ statusLabel(family.status) }}
              </span>

              <div class="driver-family__actions">
                <DwButton
                    v-if="family.status === 'missing' && family.defaultMaven"
                    size="sm"
                    :disabled="busyKey === `install:${family.id}`"
                    @click="installFamily(family)"
                >
                  {{ busyKey === `install:${family.id}`
                    ? t('settings.runtime.installing')
                    : t('settings.runtime.installDriver') }}
                </DwButton>
                <DwButton
                    v-else-if="canManageDrivers && family.status !== 'missing'"
                    size="sm"
                    variant="ghost"
                    :disabled="busyKey === family.id"
                    @click="removeFamily(family)"
                >
                  {{ t('settings.runtime.deleteAll') }}
                </DwButton>
              </div>
            </div>

            <p
                v-if="family.relatedDbTypes.length > 1"
                class="driver-family__related"
            >
              {{ t('settings.runtime.relatedTypes', {types: family.relatedDbTypes.join(', ')}) }}
            </p>

            <ul
                v-if="expandedFamilies.has(family.id) && family.versions.length"
                class="driver-versions"
                role="list"
            >
              <li
                  v-for="version in family.versions"
                  :key="version.id"
                  class="driver-version"
              >
                <div class="driver-version__row">
                  <button
                      v-if="version.jarCount > 1"
                      type="button"
                      class="driver-version__toggle"
                      @click="toggleVersionDetail(version.id)"
                  >
                    <DwIcon
                        :name="expandedVersions.has(version.id) ? 'chevron-down' : 'chevron-right'"
                        size="sm"
                        :stroke-width="2"
                    />
                    <span>
                      {{ version.version ? `v${version.version}` : t('settings.runtime.unknownVersion') }}
                    </span>
                    <span v-if="version.kind === 'bundle'" class="driver-tag">
                      {{ t('settings.runtime.bundleTag') }}
                    </span>
                  </button>
                  <span v-else class="driver-version__label">
                    {{ version.version ? `v${version.version}` : t('settings.runtime.unknownVersion') }}
                  </span>

                  <span class="driver-version__files">
                    {{ t('settings.runtime.jarCount', {count: version.jarCount}) }}
                  </span>
                  <span class="driver-version__size">{{ formatRuntimeBytes(version.sizeBytes) }}</span>
                  <span
                      class="driver-family__badge"
                      :class="version.loadedInMemory ? 'is-on' : 'is-off'"
                  >
                    {{ version.loadedInMemory ? t('settings.runtime.loaded') : t('settings.runtime.cached') }}
                  </span>
                  <div v-if="canManageDrivers" class="driver-family__actions">
                    <DwButton
                        size="sm"
                        variant="ghost"
                        :disabled="busyKey === version.id"
                        @click="removeVersion(version)"
                    >
                      {{ t('settings.runtime.deleteDriver') }}
                    </DwButton>
                  </div>
                </div>

                <ul
                    v-if="expandedVersions.has(version.id)"
                    class="driver-files"
                    role="list"
                >
                  <li
                      v-for="jar in version.jars.slice(0, DETAIL_JAR_PREVIEW)"
                      :key="jar.relativePath"
                      class="driver-files__item runtime-mono"
                  >
                    {{ jar.relativePath }}
                    <span>{{ formatRuntimeBytes(jar.sizeBytes) }}</span>
                  </li>
                  <li
                      v-if="version.jars.length > DETAIL_JAR_PREVIEW"
                      class="driver-files__more"
                  >
                    {{ t('settings.runtime.moreJars', {
                      count: version.jars.length - DETAIL_JAR_PREVIEW,
                    }) }}
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </section>

      <section v-if="orphanFamilies.length" class="runtime-library runtime-library--orphan">
        <header class="runtime-library__head">
          <div>
            <h3>{{ t('settings.runtime.orphanTitle') }}</h3>
            <p>{{ t('settings.runtime.orphanHint') }}</p>
          </div>
        </header>
        <ul class="driver-list" role="list">
          <li
              v-for="family in orphanFamilies"
              :key="`orphan:${family.id}`"
              class="driver-family"
          >
            <div class="driver-family__row">
              <span class="driver-family__name driver-family__name--plain">{{ family.label }}</span>
              <span class="driver-family__version">{{ versionSummary(family) }}</span>
              <span class="driver-family__files">
                {{ t('settings.runtime.jarCount', {count: family.jarCount}) }}
              </span>
              <span class="driver-family__size">{{ formatRuntimeBytes(family.sizeBytes) }}</span>
              <span class="driver-family__badge is-off">{{ statusLabel(family.status) }}</span>
              <div v-if="canManageDrivers" class="driver-family__actions">
                <DwButton
                    size="sm"
                    variant="ghost"
                    :disabled="busyKey === family.id"
                    @click="removeFamily(family)"
                >
                  {{ t('settings.runtime.deleteAll') }}
                </DwButton>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </SettingsPageShell>

  <ConfirmDialog
      :open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmLabel"
      :confirm-variant="confirmVariant"
      @update:open="onConfirmOpenUpdate"
      @confirm="onConfirmDialog"
  />
</template>

<style scoped>
.runtime-actions {
  display: flex;
  gap: var(--dw-gap-sm);
  align-items: center;
}

.runtime-alert {
  margin-bottom: var(--dw-space-4);
}

.runtime-status {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-bottom: var(--dw-space-5);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  overflow: hidden;
  background: var(--dw-border);
}

.runtime-status__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--dw-space-3) var(--dw-space-4);
  background: var(--dw-bg-elevated);
  min-width: 0;
}

.runtime-status__label {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.runtime-status__value {
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
}

.runtime-status__muted {
  font-weight: 500;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.runtime-status__meta {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-mono {
  font-family: var(--dw-font-mono, ui-monospace, monospace);
}

.runtime-library {
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-elevated);
  overflow: hidden;
}

.runtime-library--orphan {
  margin-top: var(--dw-space-4);
}

.runtime-library__head {
  padding: var(--dw-space-4);
  border-bottom: 1px solid var(--dw-border);
  display: flex;
  justify-content: space-between;
  gap: var(--dw-gap-md);
  align-items: flex-start;
}

.runtime-jre {
  margin-bottom: var(--dw-space-4);
}

.runtime-jre__actions {
  display: flex;
  gap: var(--dw-gap-sm);
  flex-shrink: 0;
}

.runtime-jre__alert {
  margin: var(--dw-space-3) var(--dw-space-4) 0;
}

.runtime-jre__options {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.runtime-jre__option {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px var(--dw-space-4);
  border-bottom: 1px solid var(--dw-border);
  cursor: pointer;
}

.runtime-jre__option.is-active {
  background: color-mix(in srgb, var(--dw-bg-elevated) 88%, var(--dw-accent) 12%);
}

.runtime-jre__option strong {
  display: block;
  font-size: var(--dw-text-sm);
}

.runtime-jre__hint {
  display: block;
  margin-top: 2px;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.runtime-jre__custom {
  display: flex;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-3) var(--dw-space-4) var(--dw-space-4);
}

.runtime-jre__input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg);
  color: var(--dw-text);
  padding: 6px 10px;
  font-size: var(--dw-text-sm);
}

.runtime-library__head h3 {
  margin: 0 0 4px;
  font-size: var(--dw-text-md);
}

.runtime-library__head p {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.runtime-library__sidecar-hint {
  margin-top: 6px !important;
}

.runtime-empty {
  padding: var(--dw-space-6);
  text-align: center;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.driver-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.driver-family {
  border-bottom: 1px solid var(--dw-border);
}

.driver-family:last-child {
  border-bottom: 0;
}

.driver-family__row,
.driver-version__row {
  display: grid;
  grid-template-columns: minmax(160px, 1.4fr) minmax(100px, 1fr) 90px 80px 72px auto;
  gap: var(--dw-gap-sm);
  align-items: center;
  padding: 10px var(--dw-space-4);
  min-height: var(--dw-density-lg);
}

.driver-family__row {
  background: var(--dw-bg-elevated);
}

.driver-family--open > .driver-family__row {
  background: color-mix(in srgb, var(--dw-bg-elevated) 88%, var(--dw-accent) 12%);
}

.driver-family--missing > .driver-family__row {
  opacity: 0.92;
}

.driver-family__toggle,
.driver-version__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font: inherit;
  text-align: left;
  min-width: 0;
}

.driver-family__toggle:disabled {
  cursor: default;
}

.driver-family__spacer {
  display: inline-block;
  width: var(--dw-icon-size-md);
}

.driver-family__name {
  font-weight: 600;
  font-size: var(--dw-text-sm);
}

.driver-family__delivery {
  flex-shrink: 0;
  font-size: var(--dw-text-xs);
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--dw-border);
  color: var(--dw-text-muted);
  background: var(--dw-bg);
}

.driver-family__delivery.is-sidecar {
  color: var(--dw-warning, #b45309);
  border-color: color-mix(in srgb, var(--dw-warning, #b45309) 40%, var(--dw-border));
}

.driver-family__delivery.is-on-demand {
  color: var(--dw-text-muted);
}

.driver-family__name--plain {
  padding-left: 4px;
}

.driver-family__related {
  margin: 0;
  padding: 0 var(--dw-space-4) 8px calc(var(--dw-space-4) + 24px);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.driver-family__version,
.driver-family__files,
.driver-family__size,
.driver-version__files,
.driver-version__size {
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.driver-family__badge {
  justify-self: start;
  font-size: var(--dw-text-xs);
  line-height: 1;
  padding: 4px 8px;
  border-radius: var(--dw-radius-pill);
  border: 1px solid var(--dw-border);
}

.driver-family__badge.is-on {
  color: var(--dw-success-fg);
  border-color: color-mix(in srgb, var(--dw-success-fg) 35%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-success-fg) 10%, transparent);
}

.driver-family__badge.is-off {
  color: var(--dw-text-muted);
}

.driver-family__badge.is-missing {
  color: var(--dw-warning-fg);
  border-color: color-mix(in srgb, var(--dw-warning-fg) 35%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-warning-fg) 8%, transparent);
}

.driver-family__actions {
  justify-self: end;
}

.driver-versions {
  list-style: none;
  margin: 0;
  padding: 0 0 8px;
  background: var(--dw-bg-subtle);
  border-top: 1px solid var(--dw-border);
}

.driver-version__row {
  padding-left: calc(var(--dw-space-4) + 24px);
}

.driver-version__label {
  font-size: var(--dw-text-sm);
}

.driver-tag {
  margin-left: 6px;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-radius-pill);
  padding: 1px 7px;
}

.driver-files {
  list-style: none;
  margin: 0 0 8px;
  padding: 0 calc(var(--dw-space-4) + 40px);
}

.driver-files__item {
  display: flex;
  justify-content: space-between;
  gap: var(--dw-gap-md);
  padding: 4px 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  border-bottom: 1px dashed color-mix(in srgb, var(--dw-border) 70%, transparent);
}

.driver-files__more {
  padding: 6px 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

@media (max-width: 960px) {
  .runtime-status {
    grid-template-columns: 1fr 1fr;
  }

  .driver-family__row,
  .driver-version__row {
    grid-template-columns: 1fr 1fr;
    gap: 6px 12px;
  }

  .driver-family__actions {
    grid-column: 1 / -1;
    justify-self: start;
  }
}
</style>
