<script setup lang="ts">
import {computed, onUnmounted, ref} from 'vue'
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
    connectorCardCapLimit,
    type ConnectorCardSize,
} from '@/features/datasource/services/connector-market-layout.service'
import {datasourcesApi} from '@/api/modules/datasources'
import {DwButton, ModuleHeroSettingsMenu, type ModuleHeroMenuItem} from '@/core/components'
import {connectorMarketAccentVars} from '@/features/datasource/services/connector-market-theme.service'
import type {DbType} from '@/core/types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {canMutateConnectionCatalog} from '@/features/auth/services/feature-permission.service'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import type {PackId} from '@/features/pack/types/pack.types'

const props = withDefaults(defineProps<{
    entry: ConnectorMarketEntry
    index?: number
    standalone?: boolean
    size?: ConnectorCardSize
    reorderable?: boolean
    dragging?: boolean
    dropTarget?: boolean
    /** Master-detail list: row is selectable; actions live in the detail panel. */
    selectionMode?: boolean
    selected?: boolean
}>(), {
    index: 0,
    standalone: false,
    size: 'standard',
    reorderable: false,
    dragging: false,
    dropTarget: false,
    selectionMode: false,
    selected: false,
})

const emit = defineEmits<{
    installed: []
    select: [id: string]
    dragStart: [id: string]
    dragOver: [id: string]
    drop: [id: string]
    dragEnd: []
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

function clearProgressTimer() {
    if (progressTimer != null) {
        window.clearInterval(progressTimer)
        progressTimer = null
    }
}

function clearSafetyTimer() {
    if (safetyTimer != null) {
        window.clearTimeout(safetyTimer)
        safetyTimer = null
    }
}

function clearResetTimer() {
    if (resetTimer != null) {
        window.clearTimeout(resetTimer)
        resetTimer = null
    }
}

function resetProgressUi() {
    clearProgressTimer()
    clearSafetyTimer()
    clearResetTimer()
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
    // Release the bar even if the HTTP call hangs past the UI budget (backend reload lock, etc.).
    const tokenAtStart = opToken
    safetyTimer = window.setTimeout(() => {
        if (tokenAtStart !== opToken) return
        if (!installing.value && !uninstalling.value) return
        opToken += 1
        clearProgressTimer()
        clearSafetyTimer()
        installPhase.value = 'idle'
        installProgress.value = 0
        installing.value = false
        uninstalling.value = false
        layout.showWarningToast(t('plugin.connectorMarket.installProgressTimeout'))
    }, INSTALL_UI_SAFETY_MS)
}

function finishProgress(ok: boolean) {
    clearProgressTimer()
    clearSafetyTimer()
    if (ok) {
        installPhase.value = 'done'
        installProgress.value = 100
    } else {
        installPhase.value = 'idle'
        installProgress.value = 0
    }
}

function releaseProgressSoon() {
    clearResetTimer()
    resetTimer = window.setTimeout(() => {
        if (!installing.value && !uninstalling.value) {
            installPhase.value = 'idle'
            installProgress.value = 0
        }
        resetTimer = null
    }, 320)
}

onUnmounted(() => {
    resetProgressUi()
})

const entitlementLocked = computed(() => Boolean(props.entry.entitlementLocked))
const canCreateConnection = computed(() => canMutateConnectionCatalog(auth.isGuest) && !entitlementLocked.value)
const canRemoteInstall = computed(
    () => canRemoteInstallConnector(props.entry, auth.isAdmin) && !entitlementLocked.value,
)
const canRemoteReinstall = computed(
    () => canRemoteReinstallConnector(props.entry, auth.isAdmin) && !entitlementLocked.value,
)
const canUninstall = computed(() => canUninstallConnector(props.entry, auth.isAdmin))
const redundantJar = computed(() => isRedundantPluginJar(props.entry))
const upgradeAvailable = computed(() => isConnectorUpgradeAvailable(props.entry))
const isList = computed(() => props.size === 'list')
const capLimit = computed(() => connectorCardCapLimit(props.size))
const iconSize = computed(() => {
    if (props.size === 'hero') return DB_TYPE_ICON_SIZE.header
    if (props.size === 'wide' || props.size === 'tall' || props.size === 'list') {
        return DB_TYPE_ICON_SIZE.list
    }
    return DB_TYPE_ICON_SIZE.compact
})

const cardClassList = computed(() => [
    'connector-card',
    `connector-card--${props.size}`,
    props.entry.available ? 'connector-card--ready' : 'connector-card--pending',
    entitlementLocked.value ? 'connector-card--locked' : '',
    props.standalone ? 'connector-card--page' : '',
    props.reorderable ? 'connector-card--reorderable' : '',
    props.selectionMode ? 'connector-card--selectable' : '',
    props.selected ? 'is-selected' : '',
    busy.value ? 'connector-card--busy' : '',
    props.dragging ? 'is-dragging' : '',
    props.dropTarget ? 'is-drop-target' : '',
].filter(Boolean))

function onSelectRow() {
    if (!props.selectionMode) return
    emit('select', props.entry.id)
}

function capabilityLabel(cap: string) {
    return formatConnectorCapabilityLabel(cap, t, te)
}

/** Hide noisy "listed, not installed" when the connector is already ready. */
const integrityLabel = computed(() => {
    const status = props.entry.integrityStatus
    if (status === 'missing' && props.entry.available) {
        return isList.value ? null : t('plugin.connectorMarket.integrity.unlisted')
    }
    return formatConnectorIntegrityLabel(status, t, te)
})

const integrityClass = computed(() => {
    const status = props.entry.integrityStatus
    if (status === 'missing' && props.entry.available) {
        return 'connector-card__integrity--muted'
    }
    if (status === 'verified' || status === 'bundled') return 'connector-card__integrity--verified'
    if (status === 'mismatch') return 'connector-card__integrity--mismatch'
    if (status === 'missing') return 'connector-card__integrity--missing'
    if (status === 'unsigned') return 'connector-card__integrity--unsigned'
    return ''
})

const showCaps = computed(
    () => !isList.value
        && !entitlementLocked.value
        && props.entry.available
        && props.entry.capabilities.length > 0,
)

/** Upgrade shown as the sole primary button when connect is unavailable. */
const upgradeAsPrimary = computed(
    () => props.entry.available
        && upgradeAvailable.value
        && canRemoteReinstall.value
        && !canCreateConnection.value,
)

const moreMenuItems = computed<ModuleHeroMenuItem[]>(() => {
    const items: ModuleHeroMenuItem[] = []
    if (entitlementLocked.value) return items
    if (props.entry.available) {
        // Keep reinstall/upgrade in the menu unless it is already the primary CTA.
        if (canRemoteReinstall.value && !upgradeAsPrimary.value) {
            items.push({
                id: 'reinstall',
                label: upgradeAvailable.value
                    ? t('plugin.connectorMarket.upgradeRemote')
                    : t('plugin.connectorMarket.reinstallRemote'),
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
    } else {
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
    }
    return items
})

const showMoreMenu = computed(() => moreMenuItems.value.length > 0)

function onMoreSelect(id: string) {
    if (id === 'reinstall') {
        void installRemote(new Event('click'), true)
        return
    }
    if (id === 'uninstall') {
        void uninstallRemote(new Event('click'))
        return
    }
    if (id === 'copy-guide') {
        void copyInstallGuide(new Event('click'))
        return
    }
    if (id === 'copy-path') {
        void copyPluginDir(new Event('click'))
    }
}

function onGripDragStart(event: DragEvent) {
    if (!props.reorderable) return
    event.dataTransfer?.setData('text/plain', props.entry.id)
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        const card = (event.currentTarget as HTMLElement | null)?.closest('.connector-card')
        if (card instanceof HTMLElement) {
            event.dataTransfer.setDragImage(card, 28, 28)
        }
    }
    emit('dragStart', props.entry.id)
}

function onDragOver(event: DragEvent) {
    if (!props.reorderable) return
    event.preventDefault()
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
    }
    emit('dragOver', props.entry.id)
}

function onDrop(event: DragEvent) {
    if (!props.reorderable) return
    event.preventDefault()
    emit('drop', props.entry.id)
}

function onDragEnd() {
    emit('dragEnd')
}

async function installRemote(event: Event, reinstall = false) {
    event.stopPropagation()
    if (installing.value) return
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
            layout.notifyQuiet({
                category: 'system',
                titleKey: 'installDone',
                bodyKey: 'installDone',
                params: {
                    detail: result.message
                        || (reinstall
                            ? t('plugin.connectorMarket.reinstallSuccess')
                            : t('plugin.connectorMarket.installSuccess')),
                },
            })
        }
        emit('installed')
    } catch (error) {
        if (token !== opToken) return
        finishProgress(false)
        layout.showErrorToast(
            resolveCaughtApiErrorMessage(
                error,
                t,
                reinstall
                    ? 'plugin.connectorMarket.reinstallFailed'
                    : 'plugin.connectorMarket.installFailed',
            ),
        )
    } finally {
        if (token !== opToken) return
        installing.value = false
        releaseProgressSoon()
    }
}

function openPackPaywall(event?: Event) {
    event?.stopPropagation()
    const packId = (props.entry.packId || entitlement.packForDbType(props.entry.id as DbType)) as PackId | null
    if (packId) {
        entitlement.openPaywall(packId, `connection.${props.entry.id}`)
        return
    }
    entitlement.guardDbType(props.entry.id as DbType)
}

async function uninstallRemote(event: Event) {
    event.stopPropagation()
    if (uninstalling.value || !canUninstall.value) return
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
            layout.notifyQuiet({
              category: 'system',
              titleKey: 'installDone',
              bodyKey: 'installDone',
              params: {detail: result.message || t('plugin.connectorMarket.uninstallSuccess')},
            })
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

async function copyInstallGuide(event: Event) {
    event.stopPropagation()
    try {
        await navigator.clipboard.writeText(buildConnectorInstallGuide(props.entry))
        copied.value = true
        window.setTimeout(() => {
            copied.value = false
        }, 2000)
    } catch {
        layout.showErrorToast(t('plugin.connectorMarket.copyInstallFailed'))
    }
}

async function copyPluginDir(event: Event) {
    event.stopPropagation()
    try {
        await navigator.clipboard.writeText(CONNECTOR_PLUGIN_DIR)
    } catch {
        layout.showErrorToast(t('plugin.connectorMarket.copyInstallFailed'))
    }
}

function openNewConnection(event?: Event) {
    event?.stopPropagation()
    if (entitlementLocked.value) {
        openPackPaywall(event)
        return
    }
    if (!canCreateConnection.value) {
        layout.showErrorToast(t('auth.permissionDenied'))
        return
    }
    workspace.openConnectionForm(props.entry.id as DbType)
}
</script>

<template>
  <article
      :class="cardClassList"
      :style="{...connectorMarketAccentVars(entry.id), '--cm-i': index}"
      :tabindex="selectionMode ? 0 : undefined"
      :aria-selected="selectionMode ? selected : undefined"
      :role="selectionMode ? 'option' : undefined"
      @click="onSelectRow"
      @keydown.enter.prevent="onSelectRow"
      @keydown.space.prevent="onSelectRow"
      @dragover="onDragOver"
      @drop="onDrop"
  >
    <button
        v-if="reorderable"
        class="connector-card__grip"
        type="button"
        draggable="true"
        :title="t('plugin.connectorMarket.dragToReorder')"
        :aria-label="t('plugin.connectorMarket.dragToReorder')"
        @click.stop
        @dragstart="onGripDragStart"
        @dragend="onDragEnd"
    >
      <span class="connector-card__grip-dots" aria-hidden="true"/>
    </button>

    <div class="connector-card__head">
      <div class="connector-card__icon">
        <DbTypeIcon :db-type="entry.id as DbType" :size="iconSize"/>
      </div>
      <div class="connector-card__copy">
        <strong class="connector-card__name">{{ entry.label }}</strong>
        <span class="connector-card__id">{{ entry.id }}</span>
        <span v-if="entry.version" class="connector-card__version">v{{ entry.version }}</span>
        <p
            v-if="isList && !selectionMode && !entry.available && entry.installHint"
            class="connector-card__hint connector-card__hint--inline"
        >
          {{ entry.installHint }}
        </p>
      </div>
      <span
          v-if="!isList"
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
    </div>

    <p v-if="!isList && entitlementLocked" class="connector-card__hint">
      {{ t('plugin.connectorMarket.lockedHint') }}
    </p>

    <div v-if="showCaps" class="connector-card__caps">
      <span
          v-for="cap in entry.capabilities.slice(0, capLimit)"
          :key="`${entry.id}-${cap}`"
          class="connector-card__cap"
          :title="cap"
      >
        {{ capabilityLabel(cap) }}
      </span>
      <span
          v-if="entry.capabilities.length > capLimit"
          class="connector-card__cap connector-card__cap--more"
      >
        +{{ entry.capabilities.length - capLimit }}
      </span>
    </div>

    <p v-else-if="!isList && !entry.available && entry.installHint" class="connector-card__hint">
      {{ entry.installHint }}
    </p>

    <!-- List: compact status (detail panel carries full meta when selectionMode) -->
    <div v-if="isList" class="connector-card__status">
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
      <span
          v-if="!selectionMode && integrityLabel"
          class="connector-card__integrity"
          :class="integrityClass"
      >
        {{ integrityLabel }}
      </span>
      <span
          v-if="!selectionMode && upgradeAvailable"
          class="connector-card__integrity connector-card__integrity--mismatch"
      >
        {{ t('plugin.connectorMarket.upgradeAvailableShort') }}
      </span>
    </div>

    <div
        v-else-if="integrityLabel || upgradeAvailable"
        class="connector-card__meta"
    >
      <div
          v-if="integrityLabel"
          class="connector-card__integrity"
          :class="integrityClass"
      >
        {{ integrityLabel }}
      </div>
      <div
          v-if="upgradeAvailable"
          class="connector-card__integrity connector-card__integrity--mismatch"
      >
        {{ t('plugin.connectorMarket.upgradeAvailableShort') }}
      </div>
    </div>

    <div
        v-if="busy || installPhase === 'done'"
        class="connector-card__progress"
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

    <footer v-if="standalone && !selectionMode" class="connector-card__footer">
      <div class="connector-card__footer-actions connector-card__footer-actions--bar">
        <div class="connector-card__footer-primary">
          <template v-if="entitlementLocked">
            <DwButton size="sm" @click="openPackPaywall">
              {{ isList ? t('plugin.connectorMarket.unlockPackShort') : t('plugin.connectorMarket.unlockPack') }}
            </DwButton>
          </template>
          <template v-else-if="entry.available">
            <DwButton
                v-if="canCreateConnection"
                size="sm"
                @click="openNewConnection"
            >
              {{
                isList || size === 'compact'
                    ? t('plugin.connectorMarket.newConnectionShort')
                    : t('plugin.connectorMarket.newConnection')
              }}
            </DwButton>
            <DwButton
                v-else-if="upgradeAsPrimary"
                size="sm"
                :disabled="installing"
                :loading="installing"
                @click="installRemote($event, true)"
            >
              {{ t('plugin.connectorMarket.upgradeRemote') }}
            </DwButton>
          </template>
          <template v-else>
            <DwButton
                v-if="canRemoteInstall"
                size="sm"
                :disabled="installing"
                :loading="installing"
                @click="installRemote($event, false)"
            >
              {{
                isList || size === 'compact'
                    ? t('plugin.connectorMarket.installRemoteShort')
                    : t('plugin.connectorMarket.installRemote')
              }}
            </DwButton>
          </template>
        </div>
        <ModuleHeroSettingsMenu
            v-if="showMoreMenu"
            class="connector-card__more"
            icon="ellipsis"
            placement="up"
            :ariaLabel="t('plugin.connectorMarket.moreActions')"
            :items="moreMenuItems"
            :active="busy"
            @select="onMoreSelect"
        />
      </div>
    </footer>
  </article>
</template>
