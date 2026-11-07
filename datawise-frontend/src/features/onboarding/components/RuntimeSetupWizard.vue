<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwCheckbox, DwInlineAlert} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {datasourcesApi} from '@/api'
import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {
    CORE_CONNECTOR_IDS,
    completeRuntimeSetup,
    markRuntimeSetupCompleted,
} from '@/features/onboarding/services/runtime-setup.service'
import {
    countSuccessfulConnectorInstalls,
    installConnectorsWithDrivers,
} from '@/features/settings/services/install-connectors-with-drivers.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {packNameKey, packPitchKey} from '@/features/pack/services/pack-i18n'
import type {PackId} from '@/features/pack/types/pack.types'
import {useLayoutStore} from '@/features/layout/stores/layout'

type WizardStep = 'welcome' | 'select' | 'packs' | 'progress' | 'done'

/** Optional capability packs offered during first-run setup (D-05). */
const OPTIONAL_SETUP_PACKS: PackId[] = ['pack.ai', 'pack.governance', 'pack.lineage']

const props = defineProps<{open: boolean}>()
const emit = defineEmits<{
    'update:open': [value: boolean]
    finish: []
    skip: []
}>()

const {t} = useI18n()
const auth = useAuthStore()
const entitlement = useEntitlementStore()
const layout = useLayoutStore()

const step = ref<WizardStep>('welcome')
const loadingCatalog = ref(false)
const installing = ref(false)
const catalogError = ref<string | null>(null)
const installError = ref<string | null>(null)
const packsError = ref<string | null>(null)
const enablingPacks = ref(false)
const progressMessage = ref('')
const progressPercent = ref(0)
const entries = ref<ConnectorMarketEntry[]>([])
const selected = ref<Set<string>>(new Set())
const selectedPacks = ref<Set<PackId>>(new Set())
const installSummary = ref({connectors: 0, drivers: 0, driverFailures: 0})

const canManageConnectors = computed(() => auth.isAdmin && !auth.isGuest)

/** Selected entries that still need a marketplace install (not already available). */
const pendingInstallIds = computed(() => {
    const byId = new Map(entries.value.map((entry) => [entry.id, entry]))
    return [...selected.value].filter((id) => {
        const entry = byId.get(id)
        if (!entry) return false
        if (entry.available) return false
        return Boolean(entry.downloadUrl?.trim())
    })
})

const nothingToInstall = computed(() => {
    if (loadingCatalog.value) return false
    if (catalogError.value) return false
    return pendingInstallIds.value.length === 0
})

const allListedInstalled = computed(
    () => entries.value.length > 0 && entries.value.every((entry) => entry.available),
)

const packOptions = computed(() =>
    OPTIONAL_SETUP_PACKS.map((id) => ({
        id,
        name: t(packNameKey(id)),
        pitch: t(packPitchKey(id)),
        usable: entitlement.isPackUsable(id),
    })),
)

const pendingPackTrials = computed(() =>
    [...selectedPacks.value].filter((id) => !entitlement.isPackUsable(id)),
)

const dialogTitle = computed(() => {
    if (step.value === 'welcome') return t('onboarding.runtimeSetup.welcomeTitle')
    if (step.value === 'select') return t('onboarding.runtimeSetup.selectTitle')
    if (step.value === 'packs') return t('onboarding.runtimeSetup.packsTitle')
    if (step.value === 'progress') return t('onboarding.runtimeSetup.progressTitle')
    return t('onboarding.runtimeSetup.doneTitle')
})

const primarySelectLabel = computed(() => {
    if (nothingToInstall.value) return t('onboarding.runtimeSetup.continueReady')
    if (!canManageConnectors.value) return t('onboarding.runtimeSetup.skip')
    return t('onboarding.runtimeSetup.install')
})

function close() {
    emit('update:open', false)
}

function onModalClose() {
    if (step.value === 'progress' && installing.value) return
    if (step.value === 'packs' && enablingPacks.value) return
    skipAndClose()
}

function finishAndClose() {
    markRuntimeSetupCompleted()
    close()
    emit('finish')
    void completeRuntimeSetup()
}

function skipAndClose() {
    markRuntimeSetupCompleted()
    close()
    emit('skip')
    void completeRuntimeSetup()
}

function openAdminLogin() {
    auth.openLoginDialog({overWizards: true})
}

function openPackStore() {
    finishAndClose()
    layout.setModule('packStore')
}

function retryFromError() {
    installError.value = null
    step.value = 'select'
}

function toggleId(id: string) {
    const next = new Set(selected.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected.value = next
}

function togglePack(id: PackId) {
    if (entitlement.isPackUsable(id)) return
    const next = new Set(selectedPacks.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedPacks.value = next
}

function selectCore() {
    const next = new Set<string>()
    for (const entry of entries.value) {
        if (!isCore(entry.id)) continue
        if (entry.available) continue
        if (!entry.downloadUrl?.trim()) continue
        next.add(entry.id)
    }
    selected.value = next
}

function isCore(id: string) {
    return (CORE_CONNECTOR_IDS as readonly string[]).includes(id)
}

function needsInstall(entry: ConnectorMarketEntry): boolean {
    return !entry.available && Boolean(entry.downloadUrl?.trim())
}

async function loadCatalog() {
    loadingCatalog.value = true
    catalogError.value = null
    try {
        const market = await Promise.race([
            datasourcesApi.market(),
            new Promise<never>((_, reject) => {
                window.setTimeout(() => reject(new Error('timeout')), 15_000)
            }),
        ])
        entries.value = market.connectors
            .filter((entry) => entry.downloadUrl?.trim() || entry.available)
            .slice()
            .sort((a, b) => {
                const aCore = isCore(a.id) ? 0 : 1
                const bCore = isCore(b.id) ? 0 : 1
                if (aCore !== bCore) return aCore - bCore
                const aPending = needsInstall(a) ? 0 : 1
                const bPending = needsInstall(b) ? 0 : 1
                if (aPending !== bPending) return aPending - bPending
                return a.label.localeCompare(b.label)
            })
        const defaults = new Set(
            entries.value
                .filter((entry) => isCore(entry.id) && needsInstall(entry))
                .map((entry) => entry.id),
        )
        selected.value = defaults
    } catch (err) {
        catalogError.value = resolveCaughtApiErrorMessage(err, t, 'plugin.connectorMarket.loadFailed')
        selected.value = new Set()
        entries.value = []
    } finally {
        loadingCatalog.value = false
    }
}

function goToPacksStep() {
    packsError.value = null
    selectedPacks.value = new Set(
        OPTIONAL_SETUP_PACKS.filter((id) => !entitlement.isPackUsable(id)).slice(0, 1),
    )
    step.value = 'packs'
}

async function onPrimarySelectAction() {
    if (nothingToInstall.value) {
        goToPacksStep()
        return
    }
    if (!canManageConnectors.value) {
        goToPacksStep()
        return
    }
    await startInstall()
}

async function startInstall() {
    if (!canManageConnectors.value) {
        installError.value = t('onboarding.runtimeSetup.adminRequired')
        return
    }
    const ids = pendingInstallIds.value
    if (!ids.length) {
        goToPacksStep()
        return
    }
    step.value = 'progress'
    installing.value = true
    installError.value = null
    progressPercent.value = 5
    progressMessage.value = t('onboarding.runtimeSetup.progressStarting')
    try {
        const result = await installConnectorsWithDrivers(ids, {
            withDrivers: true,
            onProgress: (p) => {
                const base = p.phase === 'connectors' ? 10 : 55
                const span = 40
                const ratio = p.total > 0 ? p.index / p.total : 1
                progressPercent.value = Math.min(95, Math.round(base + span * ratio))
                progressMessage.value = p.phase === 'connectors'
                    ? t('onboarding.runtimeSetup.progressConnectors', {current: p.index, total: p.total})
                    : t('onboarding.runtimeSetup.progressDrivers', {
                        id: p.connectorId ?? '',
                        current: p.index,
                        total: p.total,
                    })
            },
        })
        installSummary.value = {
            connectors: countSuccessfulConnectorInstalls(result.connectors.results),
            drivers: result.drivers.filter((d) => d.ok).length,
            driverFailures: result.drivers.filter((d) => !d.ok).length,
        }
        progressPercent.value = 100
        progressMessage.value = t('onboarding.runtimeSetup.progressDone')
        goToPacksStep()
    } catch (err) {
        installError.value = resolveCaughtApiErrorMessage(err, t, 'onboarding.runtimeSetup.progressFailed')
        progressMessage.value = t('onboarding.runtimeSetup.progressFailed')
    } finally {
        installing.value = false
    }
}

async function onPacksContinue() {
    const ids = pendingPackTrials.value
    if (!ids.length) {
        step.value = 'done'
        return
    }
    enablingPacks.value = true
    packsError.value = null
    try {
        for (const packId of ids) {
            await entitlement.startTrial(packId)
        }
        step.value = 'done'
    } catch (err) {
        packsError.value = resolveCaughtApiErrorMessage(err, t, 'onboarding.runtimeSetup.packsFailed')
    } finally {
        enablingPacks.value = false
    }
}

watch(
    () => props.open,
    (isOpen) => {
        if (!isOpen) return
        step.value = 'welcome'
        installError.value = null
        catalogError.value = null
        packsError.value = null
        progressPercent.value = 0
        progressMessage.value = ''
        installSummary.value = {connectors: 0, drivers: 0, driverFailures: 0}
        selected.value = new Set()
        selectedPacks.value = new Set()
        entries.value = []
        void entitlement.load().catch(() => undefined)
    },
)

watch(step, (next) => {
    if (!props.open) return
    if (next === 'select' && entries.value.length === 0 && !loadingCatalog.value) {
        void loadCatalog()
    }
})
</script>

<template>
  <AppModal
      :open="open"
      :title="dialogTitle"
      :subtitle="t('onboarding.runtimeSetup.subtitle')"
      width="560px"
      max-height="80vh"
      :close-on-escape="step !== 'progress' && !enablingPacks"
      @close="onModalClose"
  >
    <div class="runtime-setup">
      <template v-if="step === 'welcome'">
        <p class="runtime-setup__body">{{ t('onboarding.runtimeSetup.welcomeBody') }}</p>
        <ul class="runtime-setup__bullets">
          <li>{{ t('onboarding.runtimeSetup.welcomeBullet1') }}</li>
          <li>{{ t('onboarding.runtimeSetup.welcomeBullet2') }}</li>
          <li>{{ t('onboarding.runtimeSetup.welcomeBullet3') }}</li>
        </ul>
      </template>

      <template v-else-if="step === 'select'">
        <p class="runtime-setup__body">{{ t('onboarding.runtimeSetup.selectBody') }}</p>
        <DwInlineAlert v-if="allListedInstalled" variant="success" density="banner">
          {{ t('onboarding.runtimeSetup.alreadyReadyHint') }}
        </DwInlineAlert>
        <DwInlineAlert v-else-if="!canManageConnectors" variant="warning" density="banner">
          <div class="runtime-setup__admin-hint">
            <span>{{ t('onboarding.runtimeSetup.adminRequired') }}</span>
            <DwButton size="sm" variant="secondary" @click="openAdminLogin">
              {{ t('onboarding.runtimeSetup.loginAdmin') }}
            </DwButton>
          </div>
        </DwInlineAlert>
        <DwInlineAlert v-if="catalogError" variant="error" density="banner">
          {{ catalogError }}
        </DwInlineAlert>
        <DwInlineAlert v-if="installError && canManageConnectors" variant="error" density="banner">
          {{ installError }}
        </DwInlineAlert>
        <div class="runtime-setup__toolbar">
          <DwButton size="sm" variant="secondary" :disabled="loadingCatalog" @click="selectCore">
            {{ t('onboarding.runtimeSetup.selectCore') }}
          </DwButton>
          <span class="runtime-setup__muted">
            {{ t('onboarding.runtimeSetup.pendingCount', {count: pendingInstallIds.length}) }}
          </span>
        </div>
        <div v-if="loadingCatalog" class="runtime-setup__muted">
          {{ t('onboarding.runtimeSetup.loadingCatalog') }}
        </div>
        <p v-else-if="!catalogError && entries.length === 0" class="runtime-setup__muted">
          {{ t('onboarding.runtimeSetup.emptyCatalog') }}
        </p>
        <ul v-else class="runtime-setup__list" role="list">
          <li
              v-for="entry in entries"
              :key="entry.id"
              class="runtime-setup__item"
              :class="{'is-installed': entry.available}"
          >
            <DwCheckbox
                class="runtime-setup__label"
                :model-value="selected.has(entry.id)"
                :disabled="entry.available"
                @update:model-value="(checked: boolean) => { if (checked !== selected.has(entry.id)) toggleId(entry.id) }"
            >
              <span class="runtime-setup__name">
                {{ entry.label }}
                <span v-if="isCore(entry.id)" class="runtime-setup__tag">
                  {{ t('onboarding.runtimeSetup.coreTag') }}
                </span>
                <span v-if="entry.available" class="runtime-setup__tag runtime-setup__tag--ok">
                  {{ t('onboarding.runtimeSetup.installedTag') }}
                </span>
              </span>
            </DwCheckbox>
          </li>
        </ul>
      </template>

      <template v-else-if="step === 'packs'">
        <p class="runtime-setup__body">{{ t('onboarding.runtimeSetup.packsBody') }}</p>
        <DwInlineAlert v-if="packsError" variant="error" density="banner">
          {{ packsError }}
        </DwInlineAlert>
        <ul class="runtime-setup__list" role="list">
          <li
              v-for="pack in packOptions"
              :key="pack.id"
              class="runtime-setup__item"
              :class="{'is-installed': pack.usable}"
          >
            <DwCheckbox
                class="runtime-setup__label"
                :model-value="pack.usable || selectedPacks.has(pack.id)"
                :disabled="pack.usable"
                @update:model-value="() => togglePack(pack.id)"
            >
              <span class="runtime-setup__pack">
                <span class="runtime-setup__name">
                  {{ pack.name }}
                  <span v-if="pack.usable" class="runtime-setup__tag runtime-setup__tag--ok">
                    {{ t('onboarding.runtimeSetup.packsActiveTag') }}
                  </span>
                  <span v-else class="runtime-setup__tag">
                    {{ t('onboarding.runtimeSetup.packsTrialTag') }}
                  </span>
                </span>
                <span class="runtime-setup__muted">{{ pack.pitch }}</span>
              </span>
            </DwCheckbox>
          </li>
        </ul>
        <button class="runtime-setup__link" type="button" @click="openPackStore">
          {{ t('onboarding.runtimeSetup.packsOpenStore') }}
        </button>
      </template>

      <template v-else-if="step === 'progress'">
        <p class="runtime-setup__body">{{ progressMessage }}</p>
        <div class="runtime-setup__bar" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
          <div class="runtime-setup__bar-fill" :style="{width: `${progressPercent}%`}"/>
        </div>
        <DwInlineAlert v-if="installError" variant="error" density="banner">
          {{ installError }}
        </DwInlineAlert>
      </template>

      <template v-else>
        <div class="runtime-setup__done">
          <DwIcon name="check" :size="28" :stroke-width="2"/>
          <p class="runtime-setup__body">{{ t('onboarding.runtimeSetup.doneBody') }}</p>
          <p class="runtime-setup__muted">
            {{ t('onboarding.runtimeSetup.doneSummary', {
              connectors: installSummary.connectors,
              drivers: installSummary.drivers,
            }) }}
          </p>
          <DwInlineAlert
              v-if="installSummary.driverFailures > 0"
              variant="warning"
              density="banner"
          >
            {{ t('onboarding.runtimeSetup.doneDriverWarnings', {count: installSummary.driverFailures}) }}
          </DwInlineAlert>
        </div>
      </template>
    </div>

    <template #footer>
      <DwButton
          v-if="step === 'select' && !nothingToInstall && canManageConnectors"
          variant="ghost"
          @click="goToPacksStep"
      >
        {{ t('onboarding.runtimeSetup.skip') }}
      </DwButton>
      <DwButton
          v-else-if="step === 'welcome' || step === 'packs'"
          variant="ghost"
          :disabled="enablingPacks"
          @click="step === 'packs' ? (step = 'done') : skipAndClose()"
      >
        {{ t('onboarding.runtimeSetup.skip') }}
      </DwButton>
      <DwButton
          v-if="step === 'select'"
          variant="secondary"
          :disabled="installing"
          @click="step = 'welcome'"
      >
        {{ t('onboarding.back') }}
      </DwButton>
      <DwButton
          v-else-if="step === 'packs'"
          variant="secondary"
          :disabled="enablingPacks"
          @click="step = 'select'"
      >
        {{ t('onboarding.back') }}
      </DwButton>
      <DwButton
          v-if="step === 'welcome'"
          @click="step = 'select'"
      >
        {{ t('onboarding.next') }}
      </DwButton>
      <DwButton
          v-else-if="step === 'select'"
          :disabled="installing || loadingCatalog"
          @click="onPrimarySelectAction"
      >
        {{ primarySelectLabel }}
      </DwButton>
      <DwButton
          v-else-if="step === 'packs'"
          :disabled="enablingPacks"
          @click="onPacksContinue"
      >
        {{ pendingPackTrials.length
          ? t('onboarding.runtimeSetup.packsStartTrials')
          : t('onboarding.runtimeSetup.continueReady') }}
      </DwButton>
      <template v-else-if="step === 'progress' && installError">
        <DwButton variant="secondary" @click="retryFromError">
          {{ t('onboarding.runtimeSetup.retry') }}
        </DwButton>
        <DwButton variant="ghost" @click="goToPacksStep">
          {{ t('onboarding.runtimeSetup.skip') }}
        </DwButton>
      </template>
      <DwButton
          v-else-if="step === 'done'"
          @click="finishAndClose"
      >
        {{ t('onboarding.runtimeSetup.finish') }}
      </DwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.runtime-setup {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
}

.runtime-setup__body {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
  line-height: 1.5;
}

.runtime-setup__bullets {
  margin: 0;
  padding-left: 1.2rem;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
  line-height: 1.6;
}

.runtime-setup__toolbar {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
}

.runtime-setup__muted {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.runtime-setup__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 280px;
  overflow: auto;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
}

.runtime-setup__item {
  border-bottom: 1px solid var(--dw-border);
}

.runtime-setup__item:last-child {
  border-bottom: 0;
}

.runtime-setup__item.is-installed {
  opacity: 0.72;
}

.runtime-setup__label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
}

.runtime-setup__item.is-installed .runtime-setup__label {
  cursor: default;
}

.runtime-setup__name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--dw-text-sm);
}

.runtime-setup__pack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.runtime-setup__tag {
  font-size: var(--dw-text-xs);
  padding: 1px 7px;
  border-radius: var(--dw-radius-pill);
  border: 1px solid var(--dw-border);
  color: var(--dw-text-muted);
}

.runtime-setup__tag--ok {
  color: var(--dw-success-text, #15803d);
  border-color: color-mix(in srgb, var(--dw-success-text, #15803d) 35%, var(--dw-border));
}

.runtime-setup__link {
  align-self: flex-start;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
  text-decoration: underline;
}

.runtime-setup__bar {
  height: 8px;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-subtle, color-mix(in srgb, var(--dw-bg-elevated) 90%, #000 10%));
  overflow: hidden;
}

.runtime-setup__bar-fill {
  height: 100%;
  background: var(--dw-accent);
  transition: width 0.25s ease;
}

.runtime-setup__done {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--dw-space-2);
}

.runtime-setup__admin-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap-sm);
}
</style>
