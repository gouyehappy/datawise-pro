<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {
    backupApi,
    type BackupArtifactSummary,
    type BackupHealth,
    type BackupPolicy,
    type BackupRun,
    type BackupType,
    type RestoreJob,
} from '@/api/modules/backup'
import {
    ConfirmDialog,
    DwButton,
    DwCheckbox,
    DwInlineAlert,
    DwInput,
    DwSelect,
    FormField,
    StatusPill,
} from '@/core/components'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {DwIcon} from '@/core/icons'
import {extractDashboardConnections} from '@/features/dashboard/services/dashboard-summary.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSectionCard from '@/features/settings/components/SettingsSectionCard.vue'
import SettingsSegmentTabs from '@/features/settings/components/SettingsSegmentTabs.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import type {StatusVariant} from '@/core/utils/status-variant'

type PanelTab = 'overview' | 'policies' | 'history' | 'restore'
type PolicyFilter = 'all' | 'database' | 'workbench'

const {t, locale} = useI18n()
const toast = useAppToast()
const explorer = useExplorerStore()
const entitlement = useEntitlementStore()
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

const backupPro = computed(() =>
    entitlement.mode === 'open' || entitlement.isPackUsable('pack.backup'),
)

const loading = ref(false)
const health = ref<BackupHealth | null>(null)
const policies = ref<BackupPolicy[]>([])
const runs = ref<BackupRun[]>([])
const artifacts = ref<BackupArtifactSummary[]>([])
const busyId = ref<string | null>(null)
const activeTab = ref<PanelTab>('overview')
const policyFilter = ref<PolicyFilter>('all')
const editorOpen = ref(false)
const editingId = ref<string | null>(null)

const emptyPolicy = (): BackupPolicy => ({
    name: '',
    type: 'database',
    enabled: true,
    cronExpression: '0 0 2 * * ?',
    includeSqlHistory: true,
    contentMode: 'structureAndData',
    retention: {maxCount: 7, maxAgeDays: 30},
    notifyOnFailure: true,
    connectionId: '',
    database: '',
    destinationRoot: '',
})

const policyDraft = ref<BackupPolicy>(emptyPolicy())
const cronExpressionModel = computed({
    get: () => policyDraft.value.cronExpression ?? '',
    set: (value: string | number) => {
        policyDraft.value.cronExpression = String(value ?? '')
    },
})
const policyEnabledModel = computed({
    get: () => policyDraft.value.enabled !== false,
    set: (value: boolean) => {
        policyDraft.value.enabled = value
    },
})
const notifyOnFailureModel = computed({
    get: () => policyDraft.value.notifyOnFailure !== false,
    set: (value: boolean) => {
        policyDraft.value.notifyOnFailure = value
    },
})

const restoreArtifactId = ref('')
const restoreMode = ref<'full' | 'connectionsOnly'>('connectionsOnly')
const restoreConnectionId = ref('')
const restoreDatabase = ref('')
const productionAck = ref(false)
const activeRestoreJob = ref<RestoreJob | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

const segmentTabs = computed(() => [
    {id: 'overview', label: t('backupCenter.tabs.overview')},
    {id: 'policies', label: t('backupCenter.tabs.policies')},
    {id: 'history', label: t('backupCenter.tabs.history')},
    {id: 'restore', label: t('backupCenter.tabs.restore')},
])

const policyFilterTabs = computed(() => [
    {id: 'all', label: t('backupCenter.policies.filterAll', {n: policies.value.length})},
    {id: 'database', label: t('backupCenter.policies.filterDatabase', {n: databasePolicies.value.length})},
    {id: 'workbench', label: t('backupCenter.policies.filterWorkbench', {n: workbenchPolicies.value.length})},
])

const connectionOptions = computed(() =>
    extractDashboardConnections(explorer.tree, explorer.connectionHealthById).map((row) => ({
        value: row.id,
        label: `${row.name} (${row.dbType})`,
    })),
)

const typeOptions = computed(() => [
    {value: 'workbench', label: t('backupCenter.types.workbench')},
    {value: 'database', label: t('backupCenter.types.database')},
])

const contentModeOptions = computed(() => [
    {value: 'structureAndData', label: t('backupCenter.policies.contentStructureAndData')},
    {value: 'structureOnly', label: t('backupCenter.policies.contentStructureOnly')},
])

const restoreModeOptions = computed(() => [
    {value: 'connectionsOnly', label: t('backupCenter.restore.connectionsOnly')},
    {value: 'full', label: t('backupCenter.restore.full')},
])

const artifactOptions = computed(() =>
    artifacts.value.map((item) => ({
        value: item.artifactId,
        label: `${item.artifactId} · ${typeLabel(item.type)}`,
    })),
)

const workbenchPolicies = computed(() => policies.value.filter((p) => p.type === 'workbench'))
const databasePolicies = computed(() => policies.value.filter((p) => p.type === 'database'))

const filteredPolicies = computed(() => {
    if (policyFilter.value === 'database') return databasePolicies.value
    if (policyFilter.value === 'workbench') return workbenchPolicies.value
    return policies.value
})

const overdueCount = computed(() => health.value?.overduePolicies?.length ?? 0)

const freeMb = computed(() =>
    health.value ? Math.round((health.value.freeBytes || 0) / (1024 * 1024)) : null,
)

const minMb = computed(() =>
    health.value ? Math.round((health.value.diskMinFreeBytes || 0) / (1024 * 1024)) : null,
)

const diskOk = computed(() => {
    if (freeMb.value == null || minMb.value == null) return true
    return freeMb.value >= minMb.value
})

const activeRunCount = computed(() => {
    const backupActive = runs.value.filter((run) => run.status === 'running' || run.status === 'pending').length
    const restoreActive = activeRestoreJob.value
        && (activeRestoreJob.value.status === 'running' || activeRestoreJob.value.status === 'pending')
        ? 1
        : 0
    return backupActive + restoreActive
})

const recentRuns = computed(() => runs.value.slice(0, 6))

const selectedRestoreArtifact = computed(() =>
    artifacts.value.find((item) => item.artifactId === restoreArtifactId.value) ?? null,
)

const editorTitle = computed(() =>
    editingId.value ? t('backupCenter.policies.editTitle') : t('backupCenter.policies.createTitle'),
)

function typeLabel(type?: string) {
    if (type === 'database') return t('backupCenter.types.database')
    if (type === 'workbench') return t('backupCenter.types.workbench')
    return type ?? '—'
}

function connectionLabel(connectionId?: string | null) {
    if (!connectionId) return '—'
    const hit = connectionOptions.value.find((item) => item.value === connectionId)
    return hit?.label ?? connectionId
}

function policyMeta(policy: BackupPolicy) {
    const schedule = policy.cronExpression?.trim()
        ? policy.cronExpression
        : t('backupCenter.policies.manualOnly')
    if (policy.type === 'database') {
        return t('backupCenter.policies.databaseMeta', {
            connection: connectionLabel(policy.connectionId),
            database: policy.database || '—',
            schedule,
        })
    }
    return t('backupCenter.policies.workbenchMeta', {schedule})
}

function statusVariant(status?: string): StatusVariant {
    switch ((status || '').toLowerCase()) {
        case 'success':
        case 'ok':
            return 'success'
        case 'failed':
        case 'error':
            return 'error'
        case 'running':
        case 'pending':
            return 'running'
        case 'cancelled':
        case 'cancelled_partial':
        case 'partial':
            return 'warn'
        default:
            return 'neutral'
    }
}

function statusLabel(status?: string) {
    const key = `backupCenter.status.${(status || '').toLowerCase()}`
    const label = t(key)
    return label === key ? (status || '—') : label
}

function formatWhen(value?: string | null) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString(locale.value)
}

function openCreatePolicy(type: BackupType = 'database') {
    if (!entitlement.guardPack('pack.backup', 'backup.schedule')) return
    editingId.value = null
    policyDraft.value = {...emptyPolicy(), type}
    editorOpen.value = true
    activeTab.value = 'policies'
    policyFilter.value = type
}

function openEditPolicy(policy: BackupPolicy) {
    if (!entitlement.guardPack('pack.backup', 'backup.schedule')) return
    editingId.value = policy.id ?? null
    policyDraft.value = {
        ...emptyPolicy(),
        ...policy,
        retention: {
            maxCount: policy.retention?.maxCount ?? 7,
            maxAgeDays: policy.retention?.maxAgeDays ?? 30,
            maxTotalBytes: policy.retention?.maxTotalBytes ?? null,
        },
        connectionId: policy.connectionId ?? '',
        database: policy.database ?? '',
        destinationRoot: policy.destinationRoot ?? '',
        cronExpression: policy.cronExpression ?? '',
    }
    editorOpen.value = true
    if (policy.type === 'database' || policy.type === 'workbench') {
        policyFilter.value = policy.type
    }
}

function closeEditor() {
    editorOpen.value = false
    editingId.value = null
    policyDraft.value = emptyPolicy()
}

async function refresh(options?: {silent?: boolean}) {
    if (!options?.silent) {
        loading.value = true
    }
    try {
        const [h, r, a] = await Promise.all([
            backupApi.health(),
            backupApi.listRuns(),
            backupApi.listArtifacts(),
        ])
        health.value = h
        runs.value = r
        artifacts.value = a
        if (backupPro.value) {
            try {
                policies.value = await backupApi.listPolicies()
            } catch {
                policies.value = []
            }
        } else {
            policies.value = []
        }
        if (backupPro.value && activeRestoreJob.value?.id) {
            try {
                activeRestoreJob.value = await backupApi.getRestoreJob(activeRestoreJob.value.id)
            } catch {
                // keep last known restore job snapshot
            }
        }
    } catch (error) {
        if (!options?.silent) {
            toast.error(resolveCaughtApiErrorMessage(error, t, 'backupCenter.loadFailed'))
        }
    } finally {
        if (!options?.silent) {
            loading.value = false
        }
    }
}

async function backupWorkbenchNow() {
    busyId.value = 'workbench-now'
    try {
        const run = await backupApi.startRun({
            name: 'manual-workbench',
            type: 'workbench',
            includeSqlHistory: true,
        })
        toast.notify({
          category: 'system',
          titleKey: 'operationDone',
          bodyKey: 'operationDone',
          params: {detail: t('backupCenter.runStarted', {id: run.id})},
        })
        activeTab.value = 'history'
        await refresh()
    } catch (error) {
        toast.error(resolveCaughtApiErrorMessage(error, t, 'backupCenter.runFailed'))
    } finally {
        busyId.value = null
    }
}

async function savePolicy() {
    if (!entitlement.guardPack('pack.backup', 'backup.schedule')) return
    if (!policyDraft.value.name.trim()) {
        toast.error(t('backupCenter.policyNameRequired'))
        return
    }
    if (policyDraft.value.type === 'database') {
        if (!policyDraft.value.connectionId?.trim() || !policyDraft.value.database?.trim()) {
            toast.error(t('backupCenter.databaseScopeRequired'))
            return
        }
    }
    busyId.value = 'save-policy'
    try {
        const payload: BackupPolicy = {
            ...policyDraft.value,
            name: policyDraft.value.name.trim(),
            destinationRoot: policyDraft.value.destinationRoot?.trim() || null,
            cronExpression: policyDraft.value.cronExpression?.trim() || null,
            connectionId: policyDraft.value.type === 'database'
                ? policyDraft.value.connectionId?.trim()
                : null,
            database: policyDraft.value.type === 'database'
                ? policyDraft.value.database?.trim()
                : null,
        }
        if (editingId.value) {
            await backupApi.updatePolicy(editingId.value, {...payload, id: editingId.value})
        } else {
            await backupApi.createPolicy(payload)
        }
        closeEditor()
        await refresh()
    } catch (error) {
        toast.error(resolveCaughtApiErrorMessage(error, t, 'backupCenter.policySaveFailed'))
    } finally {
        busyId.value = null
    }
}

async function runPolicy(id: string) {
    if (!entitlement.guardPack('pack.backup', 'backup.schedule')) return
    busyId.value = id
    try {
        const run = await backupApi.runPolicy(id)
        toast.notify({
          category: 'system',
          titleKey: 'operationDone',
          bodyKey: 'operationDone',
          params: {detail: t('backupCenter.runStarted', {id: run.id})},
        })
        activeTab.value = 'history'
        await refresh()
    } catch (error) {
        toast.error(resolveCaughtApiErrorMessage(error, t, 'backupCenter.runFailed'))
    } finally {
        busyId.value = null
    }
}

async function togglePolicyEnabled(policy: BackupPolicy) {
    if (!entitlement.guardPack('pack.backup', 'backup.schedule')) return
    if (!policy.id) return
    busyId.value = `toggle-${policy.id}`
    try {
        await backupApi.updatePolicy(policy.id, {...policy, enabled: !policy.enabled})
        await refresh()
    } catch (error) {
        toast.error(resolveCaughtApiErrorMessage(error, t, 'backupCenter.policySaveFailed'))
    } finally {
        busyId.value = null
    }
}

async function deletePolicy(policy: BackupPolicy) {
    if (!entitlement.guardPack('pack.backup', 'backup.schedule')) return
    if (!policy.id) return
    const confirmed = await askConfirm({
        title: t('backupCenter.confirm.deletePolicyTitle'),
        message: t('backupCenter.confirm.deletePolicyMessage', {name: policy.name}),
        confirmLabel: t('backupCenter.actions.delete'),
        confirmVariant: 'danger',
    })
    if (!confirmed) return
    busyId.value = `del-${policy.id}`
    try {
        await backupApi.deletePolicy(policy.id)
        if (editingId.value === policy.id) closeEditor()
        await refresh()
    } catch (error) {
        toast.error(resolveCaughtApiErrorMessage(error, t, 'backupCenter.policyDeleteFailed'))
    } finally {
        busyId.value = null
    }
}

async function cancelRun(id: string) {
    try {
        await backupApi.cancelRun(id)
        await refresh({silent: true})
    } catch (error) {
        toast.error(resolveCaughtApiErrorMessage(error, t, 'backupCenter.cancelFailed'))
    }
}

async function cancelRestore(id: string) {
    if (!entitlement.guardPack('pack.backup', 'backup.restore')) return
    try {
        activeRestoreJob.value = await backupApi.cancelRestoreJob(id)
        await refresh({silent: true})
    } catch (error) {
        toast.error(resolveCaughtApiErrorMessage(error, t, 'backupCenter.cancelFailed'))
    }
}

async function deleteArtifact(artifact: BackupArtifactSummary) {
    const confirmed = await askConfirm({
        title: t('backupCenter.confirm.deleteArtifactTitle'),
        message: t('backupCenter.confirm.deleteArtifactMessage', {id: artifact.artifactId}),
        confirmLabel: t('backupCenter.actions.delete'),
        confirmVariant: 'danger',
    })
    if (!confirmed) return
    busyId.value = `art-${artifact.artifactId}`
    try {
        await backupApi.deleteArtifact(artifact.artifactId)
        if (restoreArtifactId.value === artifact.artifactId) restoreArtifactId.value = ''
        await refresh()
    } catch (error) {
        toast.error(resolveCaughtApiErrorMessage(error, t, 'backupCenter.artifactDeleteFailed'))
    } finally {
        busyId.value = null
    }
}

function selectArtifactForRestore(id: string) {
    if (!entitlement.guardPack('pack.backup', 'backup.restore')) return
    restoreArtifactId.value = id
    activeTab.value = 'restore'
}

async function startRestore() {
    if (!entitlement.guardPack('pack.backup', 'backup.restore')) return
    if (!restoreArtifactId.value.trim()) {
        toast.error(t('backupCenter.restoreArtifactRequired'))
        return
    }
    const artifact = selectedRestoreArtifact.value
    const job: RestoreJob = {
        artifactId: restoreArtifactId.value,
        type: artifact?.type,
        mode: artifact?.type === 'database' ? 'full' : restoreMode.value,
        targetConnectionId: restoreConnectionId.value || undefined,
        targetDatabase: restoreDatabase.value || undefined,
        productionAck: productionAck.value,
    }
    busyId.value = 'restore'
    try {
        const started = await backupApi.startRestore(job)
        activeRestoreJob.value = started
        toast.notify({
          category: 'system',
          titleKey: 'operationDone',
          bodyKey: 'operationDone',
          params: {detail: t('backupCenter.restoreStarted', {id: started.id})},
        })
        activeTab.value = 'history'
        await refresh()
    } catch (error) {
        toast.error(resolveCaughtApiErrorMessage(error, t, 'backupCenter.restoreFailed'))
    } finally {
        busyId.value = null
    }
}

onMounted(() => {
    void refresh()
    pollTimer = setInterval(() => {
        const hasActiveBackup = runs.value.some((run) => run.status === 'running' || run.status === 'pending')
        const hasActiveRestore = !!activeRestoreJob.value
            && (activeRestoreJob.value.status === 'running' || activeRestoreJob.value.status === 'pending')
        if (hasActiveBackup || hasActiveRestore) void refresh({silent: true})
    }, 3000)
})

onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <SettingsPageShell
      width="wide"
      :title="t('backupCenter.title')"
      :subtitle="t('backupCenter.subtitle')"
  >
    <template #tips>
      <SettingsTipsCard
          :title="t('backupCenter.tipTitle')"
          :content="t('backupCenter.tip')"
          icon="lock"
      />
    </template>

    <template #actions>
      <DwButton variant="secondary" size="sm" :disabled="loading" :loading="loading" @click="() => refresh()">
        {{ t('backupCenter.actions.refresh') }}
      </DwButton>
    </template>

    <div class="backup-shell">
      <div
          v-if="!backupPro"
          class="backup-shell__free-banner"
      >
        <DwInlineAlert :message="t('backupCenter.freeTierHint')"/>
        <DwButton
            variant="secondary"
            size="sm"
            type="button"
            @click="entitlement.guardPack('pack.backup', 'backup.schedule')"
        >
          {{ t('backupCenter.unlockPro') }}
        </DwButton>
      </div>
      <div class="backup-shell__toolbar">
        <SettingsSegmentTabs
            v-model="activeTab"
            variant="inline"
            :tabs="segmentTabs"
            :aria-label="t('backupCenter.title')"
        />
        <StatusPill v-if="activeRunCount" variant="running" dot>
          {{ t('backupCenter.health.activeRuns', {n: activeRunCount}) }}
        </StatusPill>
      </div>

      <!-- Overview -->
      <div v-if="activeTab === 'overview'" class="settings-groups backup-overview">
        <div class="backup-stat-grid" role="list">
          <button
              type="button"
              class="mp-stat mp-stat--icon is-clickable"
              role="listitem"
              @click="activeTab = 'policies'; policyFilter = 'all'"
          >
            <span class="mp-stat__icon" aria-hidden="true"><DwIcon name="settings-system-metrics" size="md"/></span>
            <span class="mp-stat__body">
              <span class="mp-stat__value">{{ policies.length }}</span>
              <span class="mp-stat__label">{{ t('backupCenter.health.policyCount') }}</span>
            </span>
          </button>
          <button
              type="button"
              class="mp-stat mp-stat--icon is-clickable"
              role="listitem"
              @click="activeTab = 'policies'; policyFilter = 'database'"
          >
            <span class="mp-stat__icon" aria-hidden="true"><DwIcon name="database" size="md"/></span>
            <span class="mp-stat__body">
              <span class="mp-stat__value">{{ databasePolicies.length }}</span>
              <span class="mp-stat__label">{{ t('backupCenter.types.database') }}</span>
            </span>
          </button>
          <button
              type="button"
              class="mp-stat mp-stat--icon is-clickable"
              :class="{'backup-stat--warn': overdueCount > 0}"
              role="listitem"
              @click="activeTab = 'policies'"
          >
            <span class="mp-stat__icon" aria-hidden="true"><DwIcon name="zap" size="md"/></span>
            <span class="mp-stat__body">
              <span class="mp-stat__value">{{ overdueCount }}</span>
              <span class="mp-stat__label">{{ t('backupCenter.health.overdue') }}</span>
            </span>
          </button>
          <button
              type="button"
              class="mp-stat mp-stat--icon is-clickable"
              :class="{'backup-stat--warn': !diskOk}"
              role="listitem"
              @click="activeTab = 'history'"
          >
            <span class="mp-stat__icon" aria-hidden="true"><DwIcon name="folder" size="md"/></span>
            <span class="mp-stat__body">
              <span class="mp-stat__value">
                {{ freeMb == null ? '—' : freeMb }}
                <small v-if="freeMb != null">MB</small>
              </span>
              <span class="mp-stat__label">{{ t('backupCenter.health.diskFree') }}</span>
            </span>
          </button>
          <button
              type="button"
              class="mp-stat mp-stat--icon is-clickable"
              role="listitem"
              @click="activeTab = 'history'"
          >
            <span class="mp-stat__icon" aria-hidden="true"><DwIcon name="history" size="md"/></span>
            <span class="mp-stat__body">
              <span class="mp-stat__value">{{ artifacts.length }}</span>
              <span class="mp-stat__label">{{ t('backupCenter.artifacts.title') }}</span>
            </span>
          </button>
        </div>

        <SettingsSectionCard
            :title="t('backupCenter.health.quickActions')"
            :hint="t('backupCenter.health.quickActionsHint')"
            icon="zap"
            tone="primary"
        >
          <div class="backup-actions">
            <DwButton
                variant="primary"
                size="sm"
                :disabled="!!busyId"
                :loading="busyId === 'workbench-now'"
                @click="backupWorkbenchNow"
            >
              {{ t('backupCenter.actions.backupWorkbenchNow') }}
            </DwButton>
            <DwButton size="sm" variant="secondary" @click="openCreatePolicy('database')">
              {{ t('backupCenter.actions.addDatabasePolicy') }}
            </DwButton>
            <DwButton size="sm" variant="secondary" @click="openCreatePolicy('workbench')">
              {{ t('backupCenter.actions.addWorkbenchPolicy') }}
            </DwButton>
          </div>
          <p v-if="freeMb != null" class="backup-footnote">
            {{ t('backupCenter.health.disk', {free: freeMb, min: minMb}) }}
          </p>
        </SettingsSectionCard>

        <SettingsSectionCard
            :title="t('backupCenter.health.recentRuns')"
            :hint="t('backupCenter.health.recentRunsHint')"
            icon="history"
            tone="sky"
            :badge="String(Math.min(runs.length, 6))"
        >
          <div v-if="!recentRuns.length" class="backup-empty">
            <p>{{ t('backupCenter.runs.empty') }}</p>
            <DwButton size="sm" variant="secondary" @click="openCreatePolicy('database')">
              {{ t('backupCenter.actions.addDatabasePolicy') }}
            </DwButton>
          </div>
          <ul v-else class="backup-timeline">
            <li v-for="run in recentRuns" :key="run.id">
              <span class="backup-timeline__dot" :data-tone="statusVariant(run.status)" aria-hidden="true"/>
              <div class="backup-timeline__body">
                <div class="backup-timeline__title">
                  <strong>{{ typeLabel(run.type) }}</strong>
                  <StatusPill :variant="statusVariant(run.status)" dot>
                    {{ statusLabel(run.status) }}
                  </StatusPill>
                </div>
                <div class="backup-muted">
                  <span>{{ formatWhen(run.startedAt) || run.id }}</span>
                  <span v-if="run.message"> · {{ run.message }}</span>
                </div>
              </div>
            </li>
          </ul>
          <div v-if="runs.length > 6" class="backup-actions backup-actions--foot">
            <DwButton size="sm" variant="ghost" @click="activeTab = 'history'">
              {{ t('backupCenter.actions.viewAllHistory') }}
            </DwButton>
          </div>
        </SettingsSectionCard>
      </div>

      <!-- Policies -->
      <div v-else-if="activeTab === 'policies'" class="settings-groups">
        <SettingsSectionCard
            v-if="editorOpen"
            :title="editorTitle"
            :hint="t('backupCenter.policies.editorHint')"
            icon="plus"
            tone="primary"
        >
          <div class="backup-form">
            <div class="backup-form__grid">
              <FormField :label="t('backupCenter.policies.name')">
                <DwInput v-model="policyDraft.name" :placeholder="t('backupCenter.policies.namePlaceholder')"/>
              </FormField>
              <FormField :label="t('backupCenter.policies.type')">
                <DwSelect v-model="policyDraft.type" :options="typeOptions" :disabled="!!editingId"/>
              </FormField>
              <FormField :label="t('backupCenter.policies.cron')">
                <DwInput
                    v-model="cronExpressionModel"
                    variant="mono"
                    placeholder="0 0 2 * * ?"
                />
              </FormField>
              <FormField :label="t('backupCenter.policies.retentionCount')">
                <DwInput
                    v-model.number="policyDraft.retention!.maxCount!"
                    type="number"
                    :min="1"
                />
              </FormField>
            </div>

            <div v-if="policyDraft.type === 'database'" class="backup-form__grid">
              <FormField :label="t('backupCenter.policies.connectionId')">
                <DwSelect
                    v-if="connectionOptions.length"
                    v-model="policyDraft.connectionId!"
                    :options="connectionOptions"
                    :placeholder="t('backupCenter.policies.pickConnection')"
                />
                <DwInput
                    v-else
                    v-model="policyDraft.connectionId!"
                    variant="mono"
                    :placeholder="t('backupCenter.policies.connectionId')"
                />
              </FormField>
              <FormField :label="t('backupCenter.policies.database')">
                <DwInput v-model="policyDraft.database!" :placeholder="t('backupCenter.policies.databasePlaceholder')"/>
              </FormField>
              <FormField :label="t('backupCenter.policies.contentMode')">
                <DwSelect v-model="policyDraft.contentMode!" :options="contentModeOptions"/>
              </FormField>
            </div>

            <FormField :label="t('backupCenter.policies.destinationRoot')">
              <DwInput
                  v-model="policyDraft.destinationRoot!"
                  variant="mono"
                  :placeholder="t('backupCenter.policies.destinationDefault')"
              />
            </FormField>

            <div class="backup-form__checks">
              <DwCheckbox v-model="policyEnabledModel">
                {{ t('backupCenter.policies.enabled') }}
              </DwCheckbox>
              <DwCheckbox v-model="notifyOnFailureModel">
                {{ t('backupCenter.policies.notifyOnFailure') }}
              </DwCheckbox>
            </div>

            <div class="backup-actions">
              <DwButton
                  variant="primary"
                  size="sm"
                  :disabled="!!busyId"
                  :loading="busyId === 'save-policy'"
                  @click="savePolicy"
              >
                {{ editingId ? t('backupCenter.actions.updatePolicy') : t('backupCenter.actions.savePolicy') }}
              </DwButton>
              <DwButton size="sm" variant="ghost" @click="closeEditor">
                {{ t('backupCenter.actions.cancelEdit') }}
              </DwButton>
            </div>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
            :title="t('backupCenter.policies.title')"
            :hint="t('backupCenter.policies.multiHint')"
            icon="database"
            tone="violet"
            :badge="String(filteredPolicies.length)"
        >
          <div class="backup-policy-toolbar">
            <SettingsSegmentTabs
                v-model="policyFilter"
                variant="inline"
                :tabs="policyFilterTabs"
                :aria-label="t('backupCenter.policies.title')"
            />
            <div class="backup-actions">
              <DwButton size="sm" variant="secondary" @click="openCreatePolicy('database')">
                {{ t('backupCenter.actions.addDatabasePolicy') }}
              </DwButton>
              <DwButton size="sm" variant="secondary" @click="openCreatePolicy('workbench')">
                {{ t('backupCenter.actions.addWorkbenchPolicy') }}
              </DwButton>
            </div>
          </div>

          <div v-if="!filteredPolicies.length" class="backup-empty">
            <p>
              {{
                policyFilter === 'workbench'
                  ? t('backupCenter.policies.emptyWorkbench')
                  : policyFilter === 'database'
                    ? t('backupCenter.policies.emptyDatabase')
                    : t('backupCenter.policies.emptyAll')
              }}
            </p>
            <DwButton
                size="sm"
                variant="secondary"
                @click="openCreatePolicy(policyFilter === 'workbench' ? 'workbench' : 'database')"
            >
              {{
                policyFilter === 'workbench'
                  ? t('backupCenter.actions.addWorkbenchPolicy')
                  : t('backupCenter.actions.addDatabasePolicy')
              }}
            </DwButton>
          </div>

          <div v-else class="backup-policy-list" role="list">
            <article
                v-for="policy in filteredPolicies"
                :key="policy.id"
                class="backup-policy-card"
                role="listitem"
            >
              <span
                  class="backup-policy-card__icon"
                  :class="policy.type === 'database' ? 'is-database' : 'is-workbench'"
                  aria-hidden="true"
              >
                <DwIcon
                    :name="policy.type === 'database' ? 'database' : 'settings-layout'"
                    size="md"
                    :stroke-width="1.5"
                />
              </span>
              <div class="backup-policy-card__body">
                <div class="backup-policy-card__title">
                  <strong>{{ policy.name }}</strong>
                  <span class="backup-type-chip">{{ typeLabel(policy.type) }}</span>
                  <StatusPill :variant="policy.enabled ? 'success' : 'neutral'" dot>
                    {{
                      policy.enabled
                        ? t('backupCenter.policies.statusEnabled')
                        : t('backupCenter.policies.statusDisabled')
                    }}
                  </StatusPill>
                </div>
                <p class="backup-policy-card__meta">{{ policyMeta(policy) }}</p>
              </div>
              <div class="backup-policy-card__actions">
                <DwButton
                    variant="primary"
                    size="sm"
                    :disabled="!!busyId || !policy.enabled"
                    :loading="busyId === policy.id"
                    @click="runPolicy(policy.id!)"
                >
                  {{ t('backupCenter.actions.runNow') }}
                </DwButton>
                <DwButton size="sm" variant="ghost" :disabled="!!busyId" @click="openEditPolicy(policy)">
                  {{ t('backupCenter.actions.edit') }}
                </DwButton>
                <DwButton size="sm" variant="ghost" :disabled="!!busyId" @click="togglePolicyEnabled(policy)">
                  {{ policy.enabled ? t('backupCenter.actions.disable') : t('backupCenter.actions.enable') }}
                </DwButton>
                <DwButton size="sm" variant="danger" :disabled="!!busyId" @click="deletePolicy(policy)">
                  {{ t('backupCenter.actions.delete') }}
                </DwButton>
              </div>
            </article>
          </div>
        </SettingsSectionCard>
      </div>

      <!-- History -->
      <div v-else-if="activeTab === 'history'" class="settings-groups backup-history">
        <SettingsSectionCard
            :title="t('backupCenter.runs.title')"
            :hint="t('backupCenter.runs.hint')"
            icon="history"
            tone="sky"
            :badge="String(runs.length)"
        >
          <div v-if="!runs.length && !activeRestoreJob" class="backup-empty">
            <p>{{ t('backupCenter.runs.empty') }}</p>
          </div>
          <ul v-else class="backup-row-list">
            <li v-if="activeRestoreJob">
              <div class="backup-row-list__main">
                <div class="backup-row-list__title">
                  <strong>{{ t('backupCenter.restore.jobLabel') }}</strong>
                  <StatusPill :variant="statusVariant(activeRestoreJob.status)" dot>
                    {{ statusLabel(activeRestoreJob.status) }}
                  </StatusPill>
                </div>
                <div class="backup-muted">
                  <span class="backup-mono">{{ activeRestoreJob.id }}</span>
                  <span v-if="activeRestoreJob.startedAt"> · {{ formatWhen(activeRestoreJob.startedAt) }}</span>
                </div>
                <div v-if="activeRestoreJob.message" class="backup-row-list__msg">{{ activeRestoreJob.message }}</div>
              </div>
              <DwButton
                  v-if="activeRestoreJob.status === 'running' || activeRestoreJob.status === 'pending'"
                  size="sm"
                  variant="ghost"
                  @click="cancelRestore(activeRestoreJob.id!)"
              >
                {{ t('backupCenter.actions.cancel') }}
              </DwButton>
            </li>
            <li v-for="run in runs" :key="run.id">
              <div class="backup-row-list__main">
                <div class="backup-row-list__title">
                  <strong>{{ typeLabel(run.type) }}</strong>
                  <StatusPill :variant="statusVariant(run.status)" dot>
                    {{ statusLabel(run.status) }}
                  </StatusPill>
                </div>
                <div class="backup-muted">
                  <span class="backup-mono">{{ run.id }}</span>
                  <span v-if="run.startedAt"> · {{ formatWhen(run.startedAt) }}</span>
                  <span v-if="run.finishedAt"> → {{ formatWhen(run.finishedAt) }}</span>
                </div>
                <div v-if="run.message" class="backup-row-list__msg">{{ run.message }}</div>
              </div>
              <DwButton
                  v-if="run.status === 'running' || run.status === 'pending'"
                  size="sm"
                  variant="ghost"
                  @click="cancelRun(run.id)"
              >
                {{ t('backupCenter.actions.cancel') }}
              </DwButton>
            </li>
          </ul>
        </SettingsSectionCard>

        <SettingsSectionCard
            :title="t('backupCenter.artifacts.title')"
            :hint="t('backupCenter.artifacts.hint')"
            icon="folder"
            tone="panel"
            :badge="String(artifacts.length)"
        >
          <div v-if="!artifacts.length" class="backup-empty">
            <p>{{ t('backupCenter.artifacts.empty') }}</p>
          </div>
          <ul v-else class="backup-row-list">
            <li v-for="artifact in artifacts" :key="artifact.artifactId">
              <div class="backup-row-list__main">
                <div class="backup-row-list__title">
                  <strong class="backup-mono">{{ artifact.artifactId }}</strong>
                  <span class="backup-type-chip">{{ typeLabel(artifact.type) }}</span>
                  <StatusPill v-if="artifact.status" :variant="statusVariant(artifact.status)" dot>
                    {{ statusLabel(artifact.status) }}
                  </StatusPill>
                </div>
                <div class="backup-muted">
                  <span v-if="artifact.createdAt">{{ formatWhen(artifact.createdAt) }} · </span>
                  <span class="backup-path">{{ artifact.path }}</span>
                </div>
              </div>
              <div class="backup-actions">
                <DwButton size="sm" variant="secondary" @click="selectArtifactForRestore(artifact.artifactId)">
                  {{ t('backupCenter.actions.selectRestore') }}
                </DwButton>
                <DwButton
                    size="sm"
                    variant="danger"
                    :disabled="!!busyId"
                    @click="deleteArtifact(artifact)"
                >
                  {{ t('backupCenter.actions.delete') }}
                </DwButton>
              </div>
            </li>
          </ul>
        </SettingsSectionCard>
      </div>

      <!-- Restore -->
      <div v-else class="settings-groups">
        <SettingsSectionCard
            :title="t('backupCenter.restore.title')"
            :hint="t('backupCenter.restore.hint')"
            icon="refresh"
            tone="primary"
        >
          <div class="backup-form">
            <FormField :label="t('backupCenter.restore.artifactId')">
              <DwSelect
                  v-if="artifactOptions.length"
                  v-model="restoreArtifactId"
                  :options="artifactOptions"
                  :placeholder="t('backupCenter.restore.pickArtifact')"
              />
              <DwInput v-else v-model="restoreArtifactId" variant="mono"/>
            </FormField>

            <div v-if="selectedRestoreArtifact" class="backup-restore-preview">
              <span class="backup-type-chip">{{ typeLabel(selectedRestoreArtifact.type) }}</span>
              <span class="backup-muted backup-path">{{ selectedRestoreArtifact.path }}</span>
            </div>

            <FormField
                v-if="!selectedRestoreArtifact || selectedRestoreArtifact.type === 'workbench'"
                :label="t('backupCenter.restore.mode')"
            >
              <DwSelect v-model="restoreMode" :options="restoreModeOptions"/>
            </FormField>

            <div v-if="selectedRestoreArtifact?.type === 'database'" class="backup-form__grid">
              <FormField :label="t('backupCenter.restore.targetConnectionId')">
                <DwSelect
                    v-if="connectionOptions.length"
                    v-model="restoreConnectionId"
                    :options="connectionOptions"
                    :placeholder="t('backupCenter.policies.pickConnection')"
                />
                <DwInput v-else v-model="restoreConnectionId" variant="mono"/>
              </FormField>
              <FormField :label="t('backupCenter.restore.targetDatabase')">
                <DwInput v-model="restoreDatabase"/>
              </FormField>
            </div>

            <DwCheckbox v-model="productionAck">
              {{ t('backupCenter.restore.productionAck') }}
            </DwCheckbox>

            <div class="backup-actions">
              <DwButton
                  variant="primary"
                  size="sm"
                  :disabled="!!busyId || !restoreArtifactId"
                  :loading="busyId === 'restore'"
                  @click="startRestore"
              >
                {{ t('backupCenter.actions.startRestore') }}
              </DwButton>
              <DwButton
                  v-if="!artifactOptions.length"
                  size="sm"
                  variant="ghost"
                  @click="activeTab = 'history'"
              >
                {{ t('backupCenter.actions.viewArtifacts') }}
              </DwButton>
            </div>
          </div>
        </SettingsSectionCard>
      </div>
    </div>
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
.backup-shell {
  display: grid;
  gap: var(--dw-space-4);
}

.backup-shell__free-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
}

.backup-shell__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-3);
}

.backup-overview {
  gap: var(--dw-space-4);
}

.backup-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
  gap: var(--dw-space-3);
}

.backup-stat-grid .mp-stat {
  width: 100%;
  margin: 0;
  font: inherit;
  color: inherit;
  text-align: left;
}

.backup-stat--warn {
  border-color: color-mix(in srgb, var(--dw-warning) 45%, var(--dw-panel-border));
  background: color-mix(in srgb, var(--dw-warning-soft) 40%, var(--dw-bg-panel));
}

.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2);
  align-items: center;
}

.backup-actions--foot {
  margin-top: var(--dw-space-3);
}

.backup-footnote {
  margin: var(--dw-space-3) 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.backup-form {
  display: grid;
  gap: var(--dw-space-3);
}

.backup-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dw-space-3);
}

.backup-form__checks {
  display: grid;
  gap: var(--dw-space-2);
}

.backup-policy-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-3);
  margin-bottom: var(--dw-space-4);
}

.backup-policy-list {
  display: grid;
  gap: var(--dw-space-2);
}

.backup-policy-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--dw-space-3);
  align-items: start;
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 1px solid var(--dw-border-subtle);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface);
  transition: var(--dw-transition-colors);
}

.backup-policy-card:hover {
  border-color: var(--dw-border);
  background: var(--dw-surface-raised);
}

.backup-policy-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--dw-control-radius-sm);
  color: var(--mp-tone);
  background: color-mix(in srgb, var(--mp-tone) 12%, transparent);
}

.backup-policy-card__icon.is-database {
  --mp-tone: var(--dw-info);
}

.backup-policy-card__icon.is-workbench {
  --mp-tone: var(--dw-text-secondary);
}

.backup-policy-card__body {
  min-width: 0;
  display: grid;
  gap: var(--dw-space-1);
}

.backup-policy-card__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-2);
}

.backup-policy-card__title strong {
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
}

.backup-policy-card__meta {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading);
  word-break: break-word;
}

.backup-policy-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-1);
  justify-content: flex-end;
}

.backup-type-chip {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid var(--dw-border-subtle);
  background: var(--dw-surface-muted);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: 1.5;
}

.backup-empty {
  display: grid;
  gap: var(--dw-space-3);
  justify-items: start;
  padding: var(--dw-space-2) 0;
}

.backup-empty p {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.backup-muted {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.backup-mono,
.backup-path {
  font-family: var(--dw-mono);
}

.backup-path {
  word-break: break-all;
}

.backup-timeline,
.backup-row-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--dw-space-2);
}

.backup-timeline li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--dw-space-3);
  align-items: start;
  padding: var(--dw-space-2) 0;
}

.backup-timeline__dot {
  width: 0.55rem;
  height: 0.55rem;
  margin-top: 0.35rem;
  border-radius: 50%;
  background: var(--dw-text-muted);
}

.backup-timeline__dot[data-tone='success'] {
  background: var(--dw-success);
}

.backup-timeline__dot[data-tone='error'] {
  background: var(--dw-danger);
}

.backup-timeline__dot[data-tone='running'] {
  background: var(--dw-info);
}

.backup-timeline__dot[data-tone='warn'] {
  background: var(--dw-warning);
}

.backup-timeline__body {
  display: grid;
  gap: var(--dw-space-1);
  min-width: 0;
}

.backup-timeline__title,
.backup-row-list__title {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2);
  align-items: center;
}

.backup-row-list li {
  display: flex;
  justify-content: space-between;
  gap: var(--dw-space-3);
  align-items: flex-start;
  padding: var(--dw-space-3) var(--dw-space-3);
  border: 1px solid var(--dw-border-subtle);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface);
}

.backup-row-list__main {
  display: grid;
  gap: var(--dw-space-1);
  min-width: 0;
}

.backup-row-list__msg {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
}

.backup-restore-preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-2);
  padding: var(--dw-space-3);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface-muted);
  border: 1px solid var(--dw-border-subtle);
}

.backup-history {
  gap: var(--dw-space-4);
}

@media (max-width: 720px) {
  .backup-form__grid {
    grid-template-columns: 1fr;
  }

  .backup-policy-card {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .backup-policy-card__actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }

  .backup-row-list li {
    flex-direction: column;
  }
}
</style>
