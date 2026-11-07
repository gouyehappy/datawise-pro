<script setup lang="ts">
import {computed, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'
import {
    buildConnectorInstallGuide,
    canRemoteInstallConnector,
    canRemoteReinstallConnector,
    canUninstallConnector,
    CONNECTOR_PLUGIN_DIR,
    formatConnectorCapabilityLabel,
    formatConnectorIntegrityLabel,
    isConnectorUpgradeAvailable,
    isRedundantPluginJar,
} from '@/features/datasource/services/connector-market.service'
import {
    resolveConnectorMarketHighlights,
    resolveConnectorMarketIntro,
} from '@/features/datasource/services/connector-market-intro.service'
import {categoryForConnectorId} from '@/features/datasource/services/connector-market-category.service'
import {DB_TYPE_CATEGORIES} from '@/features/connection/constants/db-type-categories'
import {datasourcesApi} from '@/api/modules/datasources'
import {DwButton, EmptyState, ModuleHeroSettingsMenu, type ModuleHeroMenuItem} from '@/core/components'
import {connectorMarketAccentVars} from '@/features/datasource/services/connector-market-theme.service'
import type {DbType} from '@/core/types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {canMutateConnectionCatalog} from '@/features/auth/services/feature-permission.service'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import type {PackId} from '@/features/pack/types/pack.types'

const props = defineProps<{
    entry: ConnectorMarketEntry | null
}>()

const emit = defineEmits<{
    installed: []
}>()

const {t, te} = useI18n()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const auth = useAuthStore()
const entitlement = useEntitlementStore()

const copied = ref(false)
const installing = ref(false)
const uninstalling = ref(false)
const installProgress = ref(0)
const installPhase = ref<'idle' | 'fetch' | 'verify' | 'load' | 'done'>('idle')
let progressTimer: number | null = null
let safetyTimer: number | null = null
let resetTimer: number | null = null
let opToken = 0
const INSTALL_UI_SAFETY_MS = 75_000

const busy = computed(() => installing.value || uninstalling.value)
const progressLabel = computed(() => {
    if (uninstalling.value) return t('plugin.connectorMarket.uninstalling')
    if (installPhase.value === 'verify') return t('plugin.connectorMarket.installPhase.verify')
    if (installPhase.value === 'load') return t('plugin.connectorMarket.installPhase.load')
    if (installPhase.value === 'done') return t('plugin.connectorMarket.installPhase.done')
    if (installing.value) return t('plugin.connectorMarket.installPhase.fetch')
    return t('plugin.connectorMarket.installing')
})

function clearTimers() {
    if (progressTimer != null) {
        window.clearInterval(progressTimer)
        progressTimer = null
    }
    if (safetyTimer != null) {
        window.clearTimeout(safetyTimer)
        safetyTimer = null
    }
    if (resetTimer != null) {
        window.clearTimeout(resetTimer)
        resetTimer = null
    }
}

function resetProgressUi() {
    clearTimers()
    installPhase.value = 'idle'
    installProgress.value = 0
}

function beginProgress(kind: 'install' | 'uninstall') {
    resetProgressUi()
    installProgress.value = kind === 'uninstall' ? 12 : 8
    installPhase.value = kind === 'uninstall' ? 'load' : 'fetch'
    progressTimer = window.setInterval(() => {
        const cap = installPhase.value === 'load' ? 88 : 72
        if (installProgress.value < cap) {
            installProgress.value = Math.min(cap, installProgress.value + 2 + Math.random() * 4)
        } else if (installPhase.value === 'fetch' && installProgress.value >= 36) {
            installPhase.value = 'verify'
        } else if (installPhase.value === 'verify' && installProgress.value >= 64) {
            installPhase.value = 'load'
        }
    }, 180)
    const tokenAtStart = opToken
    safetyTimer = window.setTimeout(() => {
        if (tokenAtStart !== opToken) return
        if (!installing.value && !uninstalling.value) return
        opToken += 1
        clearTimers()
        installPhase.value = 'idle'
        installProgress.value = 0
        installing.value = false
        uninstalling.value = false
        layout.showWarningToast(t('plugin.connectorMarket.installProgressTimeout'))
    }, INSTALL_UI_SAFETY_MS)
}

function finishProgress(ok: boolean) {
    if (progressTimer != null) {
        window.clearInterval(progressTimer)
        progressTimer = null
    }
    if (safetyTimer != null) {
        window.clearTimeout(safetyTimer)
        safetyTimer = null
    }
    if (ok) {
        installPhase.value = 'done'
        installProgress.value = 100
    } else {
        installPhase.value = 'idle'
        installProgress.value = 0
    }
}

function releaseProgressSoon() {
    if (resetTimer != null) window.clearTimeout(resetTimer)
    resetTimer = window.setTimeout(() => {
        if (!installing.value && !uninstalling.value) {
            installPhase.value = 'idle'
            installProgress.value = 0
        }
        resetTimer = null
    }, 320)
}

watch(() => props.entry?.id, () => {
    installing.value = false
    uninstalling.value = false
    resetProgressUi()
})

onUnmounted(() => {
    resetProgressUi()
})

const entitlementLocked = computed(() => Boolean(props.entry?.entitlementLocked))
const canCreateConnection = computed(
    () => Boolean(props.entry) && canMutateConnectionCatalog(auth.isGuest) && !entitlementLocked.value,
)
const canRemoteInstall = computed(
    () => Boolean(props.entry)
        && canRemoteInstallConnector(props.entry!, auth.isAdmin)
        && !entitlementLocked.value,
)
const canRemoteReinstall = computed(
    () => Boolean(props.entry)
        && canRemoteReinstallConnector(props.entry!, auth.isAdmin)
        && !entitlementLocked.value,
)
const canUninstall = computed(
    () => Boolean(props.entry) && canUninstallConnector(props.entry!, auth.isAdmin),
)
const redundantJar = computed(() => Boolean(props.entry && isRedundantPluginJar(props.entry)))
const upgradeAvailable = computed(() => Boolean(props.entry && isConnectorUpgradeAvailable(props.entry)))

const intro = computed(() => {
    if (!props.entry) return ''
    return resolveConnectorMarketIntro(props.entry, t, te)
})

const highlights = computed(() => {
    if (!props.entry) return []
    return resolveConnectorMarketHighlights(props.entry, t, te)
})

const categoryTitle = computed(() => {
    if (!props.entry) return ''
    const key = categoryForConnectorId(props.entry.id)
    const def = DB_TYPE_CATEGORIES.find((cat) => cat.key === key)
    return def ? t(def.titleKey) : ''
})

const integrityLabel = computed(() => {
    if (!props.entry) return null
    const status = props.entry.integrityStatus
    if (status === 'missing' && props.entry.available) {
        return t('plugin.connectorMarket.integrity.unlisted')
    }
    return formatConnectorIntegrityLabel(status, t, te)
})

function capabilityLabel(cap: string) {
    return formatConnectorCapabilityLabel(cap, t, te)
}

async function installRemote(reinstall = false) {
    if (!props.entry || installing.value) return
    if (entitlementLocked.value) {
        openPackPaywall()
        return
    }
    if (reinstall) {
        if (!canRemoteReinstall.value) return
    } else if (!canRemoteInstall.value) {
        return
    }
    const token = ++opToken
    installing.value = true
    beginProgress('install')
    try {
        const result = await datasourcesApi.installFromMarket(props.entry.id)
        if (token !== opToken) return
        finishProgress(true)
        if (result.restartRequired) {
            layout.showWarningToast(result.message || t('plugin.connectorMarket.installSuccessRestart'))
        } else {
            layout.showSuccessToast(
                result.message
                || (reinstall
                    ? t('plugin.connectorMarket.reinstallSuccess')
                    : t('plugin.connectorMarket.installSuccess')),
            )
        }
        emit('installed')
    } catch (error) {
        if (token !== opToken) return
        finishProgress(false)
        layout.showErrorToast(
            error instanceof Error
                ? error.message
                : (reinstall
                    ? t('plugin.connectorMarket.reinstallFailed')
                    : t('plugin.connectorMarket.installFailed')),
        )
    } finally {
        if (token !== opToken) return
        installing.value = false
        releaseProgressSoon()
    }
}

async function uninstallRemote() {
    if (!props.entry || uninstalling.value || !canUninstall.value) return
    const token = ++opToken
    uninstalling.value = true
    beginProgress('uninstall')
    try {
        const result = await datasourcesApi.uninstallFromMarket(props.entry.id)
        if (token !== opToken) return
        finishProgress(true)
        if (result.restartRequired) {
            layout.showWarningToast(result.message || t('plugin.connectorMarket.uninstallSuccessRestart'))
        } else {
            layout.showSuccessToast(result.message || t('plugin.connectorMarket.uninstallSuccess'))
        }
        emit('installed')
    } catch (error) {
        if (token !== opToken) return
        finishProgress(false)
        layout.showErrorToast(
            resolveCaughtApiErrorMessage(error, t, 'plugin.connectorMarket.uninstallFailed'),
        )
    } finally {
        if (token !== opToken) return
        uninstalling.value = false
        releaseProgressSoon()
    }
}

function openPackPaywall() {
    if (!props.entry) return
    const packId = (props.entry.packId || entitlement.packForDbType(props.entry.id as DbType)) as PackId | null
    if (packId) {
        entitlement.openPaywall(packId, `connection.${props.entry.id}`)
        return
    }
    entitlement.guardDbType(props.entry.id as DbType)
}

async function copyInstallGuide() {
    if (!props.entry) return
    try {
        await navigator.clipboard.writeText(buildConnectorInstallGuide(props.entry))
        copied.value = true
        layout.showSuccessToast(t('plugin.connectorMarket.copyInstallSuccess'))
        window.setTimeout(() => {
            copied.value = false
        }, 2000)
    } catch {
        layout.showErrorToast(t('plugin.connectorMarket.copyInstallFailed'))
    }
}

async function copyPluginDir() {
    try {
        await navigator.clipboard.writeText(CONNECTOR_PLUGIN_DIR)
        layout.showSuccessToast(t('plugin.connectorMarket.copyPathSuccess'))
    } catch {
        layout.showErrorToast(t('plugin.connectorMarket.copyInstallFailed'))
    }
}

function openNewConnection() {
    if (!props.entry) return
    if (entitlementLocked.value) {
        openPackPaywall()
        return
    }
    if (!canCreateConnection.value) {
        layout.showErrorToast(t('auth.permissionDenied'))
        return
    }
    workspace.openConnectionForm(props.entry.id as DbType)
}

const moreMenuItems = computed<ModuleHeroMenuItem[]>(() => {
    const entry = props.entry
    if (!entry || entitlementLocked.value) return []
    const items: ModuleHeroMenuItem[] = []
    if (entry.available) {
        // Visible "upgrade" button already covers this when upgradeAvailable.
        if (canRemoteReinstall.value && !upgradeAvailable.value) {
            items.push({
                id: 'reinstall',
                label: t('plugin.connectorMarket.reinstallRemote'),
                icon: 'refresh',
                disabled: installing.value,
            })
        }
        if (canUninstall.value) {
            items.push({
                id: 'uninstall',
                label: redundantJar.value
                    ? t('plugin.connectorMarket.cleanRedundant')
                    : t('plugin.connectorMarket.uninstall'),
                icon: 'delete',
                disabled: uninstalling.value,
                dividerBefore: items.length > 0,
            })
        }
    } else if (canRemoteInstall.value) {
        // Install is the primary CTA; keep helpers in the menu only.
        items.push({
            id: 'copy-guide',
            label: copied.value
                ? t('plugin.connectorMarket.copied')
                : t('plugin.connectorMarket.copyInstall'),
            icon: 'copy',
        })
        items.push({
            id: 'copy-path',
            label: t('plugin.connectorMarket.copyPath'),
            icon: 'copy',
        })
    } else {
        // No install URL — copy-guide is primary; menu only needs the path helper.
        items.push({
            id: 'copy-path',
            label: t('plugin.connectorMarket.copyPath'),
            icon: 'copy',
        })
    }
    return items
})

function onMoreSelect(id: string) {
    if (id === 'reinstall') {
        void installRemote(true)
        return
    }
    if (id === 'uninstall') {
        void uninstallRemote()
        return
    }
    if (id === 'copy-guide') {
        void copyInstallGuide()
        return
    }
    if (id === 'copy-path') {
        void copyPluginDir()
    }
}
</script>

<template>
  <EmptyState
      v-if="!entry"
      embedded
      :title="t('plugin.connectorMarket.detailEmpty')"
      :hint="t('plugin.connectorMarket.detailEmptyHint')"
  />

  <article
      v-else
      class="connector-market-detail"
      :style="connectorMarketAccentVars(entry.id)"
  >
    <header class="connector-market-detail__hero">
      <div class="connector-market-detail__icon">
        <DbTypeIcon :db-type="entry.id as DbType" :size="DB_TYPE_ICON_SIZE.header"/>
      </div>
      <div class="connector-market-detail__titles">
        <h3>{{ entry.label }}</h3>
        <p>
          <code>{{ entry.id }}</code>
          <span v-if="entry.version">v{{ entry.version }}</span>
          <span v-if="categoryTitle" class="connector-market-detail__cat">{{ categoryTitle }}</span>
        </p>
      </div>
      <span
          class="connector-card__badge"
          :class="entitlementLocked
            ? 'connector-card__badge--locked'
            : entry.available
              ? 'connector-card__badge--ready'
              : 'connector-card__badge--pending'"
      >
        {{
          entitlementLocked
              ? t('plugin.connectorMarket.statusLocked')
              : entry.available
                  ? t('plugin.connectorMarket.statusAvailable')
                  : t('plugin.connectorMarket.statusPending')
        }}
      </span>
    </header>

    <p class="connector-market-detail__intro">{{ intro }}</p>

    <ul v-if="highlights.length" class="connector-market-detail__highlights">
      <li v-for="(line, i) in highlights" :key="`${entry.id}-h-${i}`">{{ line }}</li>
    </ul>

    <section v-if="entry.available && entry.capabilities.length" class="connector-market-detail__section">
      <h4>{{ t('plugin.connectorMarket.detailCapabilities') }}</h4>
      <div class="connector-market-detail__caps">
        <span
            v-for="cap in entry.capabilities"
            :key="`${entry.id}-${cap}`"
            class="connector-card__cap"
            :title="cap"
        >
          {{ capabilityLabel(cap) }}
        </span>
      </div>
    </section>

    <section class="connector-market-detail__section">
      <h4>{{ t('plugin.connectorMarket.detailMeta') }}</h4>
      <dl class="connector-market-detail__meta">
        <div v-if="integrityLabel">
          <dt>{{ t('plugin.connectorMarket.detailIntegrity') }}</dt>
          <dd>{{ integrityLabel }}</dd>
        </div>
        <div v-if="entry.jarName">
          <dt>{{ t('plugin.connectorMarket.detailJar') }}</dt>
          <dd><code>{{ entry.jarName }}</code></dd>
        </div>
        <div v-if="entry.downloadUrl">
          <dt>{{ t('plugin.connectorMarket.detailDownload') }}</dt>
          <dd class="connector-market-detail__url">{{ entry.downloadUrl }}</dd>
        </div>
        <div v-if="upgradeAvailable">
          <dt>{{ t('plugin.connectorMarket.detailUpdate') }}</dt>
          <dd>{{ t('plugin.connectorMarket.upgradeAvailable') }}</dd>
        </div>
      </dl>
    </section>

    <p v-if="!entry.available && entry.installHint" class="connector-market-detail__hint">
      {{ entry.installHint }}
    </p>
    <p v-if="entitlementLocked" class="connector-market-detail__hint">
      {{ t('plugin.connectorMarket.lockedHint') }}
    </p>

    <div
        v-if="busy || installPhase === 'done'"
        class="connector-market-detail__progress"
        role="progressbar"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="Math.round(installProgress)"
        :aria-label="t('plugin.connectorMarket.installProgressAria')"
    >
      <div class="connector-card__progress-track" aria-hidden="true">
        <span
            class="connector-card__progress-fill"
            :class="{'connector-card__progress-fill--done': installPhase === 'done'}"
            :style="{width: `${Math.max(4, Math.min(100, installProgress))}%`}"
        />
      </div>
      <span class="connector-card__progress-label">{{ progressLabel }}</span>
    </div>

    <footer class="connector-market-detail__actions">
      <div class="connector-market-detail__actions-main">
        <template v-if="entitlementLocked">
          <DwButton @click="openPackPaywall">
            {{ t('plugin.connectorMarket.unlockPack') }}
          </DwButton>
        </template>
        <template v-else-if="entry.available">
          <DwButton v-if="canCreateConnection" @click="openNewConnection">
            {{ t('plugin.connectorMarket.newConnection') }}
          </DwButton>
          <DwButton
              v-if="upgradeAvailable && canRemoteReinstall"
              variant="secondary"
              :disabled="installing"
              :loading="installing"
              @click="installRemote(true)"
          >
            {{ t('plugin.connectorMarket.upgradeRemote') }}
          </DwButton>
        </template>
        <template v-else>
          <DwButton
              v-if="canRemoteInstall"
              :disabled="installing"
              :loading="installing"
              @click="installRemote(false)"
          >
            {{ t('plugin.connectorMarket.installRemote') }}
          </DwButton>
          <DwButton
              v-else
              variant="secondary"
              @click="copyInstallGuide"
          >
            {{ copied ? t('plugin.connectorMarket.copied') : t('plugin.connectorMarket.copyInstall') }}
          </DwButton>
        </template>
      </div>
      <ModuleHeroSettingsMenu
          v-if="moreMenuItems.length"
          class="connector-market-detail__more"
          icon="ellipsis"
          placement="up"
          :ariaLabel="t('plugin.connectorMarket.moreActions')"
          :items="moreMenuItems"
          :active="busy"
          @select="onMoreSelect"
      />
    </footer>
  </article>
</template>
