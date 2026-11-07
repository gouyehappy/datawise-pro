<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {settingsApi, type HealthSnapshot, type SystemMetricsSnapshot} from '@/api'
import type {DeploymentProfileSnapshot, LegacyConfigMigrationStatus} from '@/shared/api/types'
import {
    formatBytes,
    formatDuration,
    formatMetricTime,
    formatPercent,
} from '@/features/settings/services/system-metrics-format.service'
import {
    deploymentCheckLabelKey,
    deploymentModeLabelKey,
    deploymentStatusTone,
    sortDeploymentChecks,
} from '@/features/settings/services/deployment-profile.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {DwButton, DwCheckbox, DwInlineAlert} from '@/core/components'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const REFRESH_INTERVAL_MS = 15_000

const {t, te} = useI18n()
const layout = useLayoutStore()
const auth = useAuthStore()

const loading = ref(false)
const autoRefresh = ref(true)
const metrics = ref<SystemMetricsSnapshot | null>(null)
const health = ref<HealthSnapshot | null>(null)
const deployment = ref<DeploymentProfileSnapshot | null>(null)
const configMigration = ref<LegacyConfigMigrationStatus | null>(null)
const migratingConfig = ref(false)
const lastError = ref<string | null>(null)

let refreshTimer: ReturnType<typeof setInterval> | null = null

const healthOk = computed(() => {
    const status = metrics.value?.healthStatus?.toUpperCase()
    return status === 'UP' || health.value?.result?.ok === true
})

const heapUsagePercent = computed(() => metrics.value?.jvm.heapUsagePercent ?? null)

const heapBarWidth = computed(() => {
    const percent = heapUsagePercent.value
    if (percent == null) return '0%'
    return `${Math.min(100, Math.max(0, percent))}%`
})

const endpointLabel = settingsApi.resolveBackendEndpointLabel()

const heapTone = computed(() => {
    const percent = heapUsagePercent.value
    if (percent == null) return 'neutral'
    if (percent >= 90) return 'danger'
    if (percent >= 75) return 'warn'
    return 'ok'
})

const deploymentChecks = computed(() => sortDeploymentChecks(deployment.value?.checks ?? []))

const deploymentModeLabel = computed(() => {
    const mode = deployment.value?.mode ?? 'default'
    return t(deploymentModeLabelKey(mode))
})

function checkLabel(id: string): string {
    const key = deploymentCheckLabelKey(id)
    return te(key) ? t(key) : id
}

async function refreshMetrics() {
    if (loading.value) return
    loading.value = true
    lastError.value = null
    try {
        const [nextMetrics, nextHealth, nextDeployment, nextMigration] = await Promise.all([
            settingsApi.fetchMetrics(),
            settingsApi.pingHealth(),
            settingsApi.fetchDeploymentProfile().catch(() => null),
            settingsApi.fetchConfigMigrationStatus().catch(() => null),
        ])
        metrics.value = nextMetrics
        health.value = nextHealth
        deployment.value = nextDeployment
        configMigration.value = nextMigration
    } catch (error) {
        lastError.value = resolveCaughtApiErrorMessage(error, t, 'dashboard.runtimeMetricsUnavailable')
    } finally {
        loading.value = false
    }
}

async function applyConfigMigration() {
    if (migratingConfig.value) return
    migratingConfig.value = true
    lastError.value = null
    try {
        configMigration.value = await settingsApi.applyConfigMigration()
        layout.showSuccessToast(t('settings.systemMetrics.configMigration.applied', {
            count: configMigration.value.migrated?.length ?? 0,
        }))
    } catch (error) {
        lastError.value = resolveCaughtApiErrorMessage(error, t, 'dashboard.runtimeMetricsUnavailable')
    } finally {
        migratingConfig.value = false
    }
}

function startAutoRefresh() {
    stopAutoRefresh()
    if (!autoRefresh.value) return
    refreshTimer = setInterval(() => {
        void refreshMetrics()
    }, REFRESH_INTERVAL_MS)
}

function stopAutoRefresh() {
    if (refreshTimer != null) {
        clearInterval(refreshTimer)
        refreshTimer = null
    }
}

function onToggleAutoRefresh(next: boolean) {
    autoRefresh.value = next
    if (autoRefresh.value) {
        startAutoRefresh()
        return
    }
    stopAutoRefresh()
}

onMounted(() => {
    void refreshMetrics()
    startAutoRefresh()
})

onUnmounted(() => {
    stopAutoRefresh()
})

function showRefreshToast() {
    // 失败已在面板 DwInlineAlert 就地展示，避免双通道
    if (lastError.value) return
    layout.showSuccessToast(t('settings.systemMetrics.refreshed'))
}
</script>

<template>
  <SettingsPageShell
      :title="t('settings.systemMetrics.title')"
      :subtitle="t('settings.systemMetrics.subtitle')"
  >
    <template #actions>
      <div class="panel-actions">
        <DwCheckbox
            class="auto-refresh"
            :model-value="autoRefresh"
            @update:model-value="onToggleAutoRefresh"
        >
          {{ t('settings.systemMetrics.autoRefresh') }}
        </DwCheckbox>
        <DwButton
            variant="secondary"
            :loading="loading"
            :disabled="loading"
            @click="refreshMetrics().then(showRefreshToast)"
        >
          {{ loading ? t('settings.systemMetrics.refreshing') : t('settings.systemMetrics.refresh') }}
        </DwButton>
      </div>
    </template>

    <DwInlineAlert :message="lastError"/>

    <div class="settings-groups">
      <section v-if="configMigration" class="setting-block metrics-section">
        <div class="section-head">
          <h3>{{ t('settings.systemMetrics.configMigration.title') }}</h3>
          <span class="section-meta">
            {{ t('settings.systemMetrics.configMigration.pending', {count: configMigration.pendingCount}) }}
          </span>
        </div>
        <p class="deployment-hint">{{ t('settings.systemMetrics.configMigration.hint') }}</p>
        <div v-if="auth.isAdmin && configMigration.pendingCount > 0" class="panel-actions">
          <DwButton
              variant="secondary"
              :loading="migratingConfig"
              :disabled="migratingConfig"
              @click="applyConfigMigration"
          >
            {{ t('settings.systemMetrics.configMigration.apply') }}
          </DwButton>
        </div>
      </section>

      <section v-if="deployment" class="setting-block metrics-section">
        <div class="section-head">
          <h3>{{ t('settings.systemMetrics.deployment.title') }}</h3>
          <span class="section-meta">
            {{ deploymentModeLabel }}
            · {{ t('settings.systemMetrics.deployment.summary', {
              ok: deployment.okCount,
              warn: deployment.warnCount,
              info: deployment.infoCount,
            }) }}
          </span>
        </div>
        <p class="deployment-hint">{{ t('settings.systemMetrics.deployment.hint') }}</p>
        <ul class="deployment-list">
          <li
              v-for="check in deploymentChecks"
              :key="check.id"
              class="deployment-row"
              :data-tone="deploymentStatusTone(check.status)"
          >
            <div class="deployment-row__main">
              <strong>{{ checkLabel(check.id) }}</strong>
              <span class="deployment-row__status">
                {{ t(`settings.systemMetrics.deployment.status.${deploymentStatusTone(check.status)}`) }}
              </span>
            </div>
            <div class="deployment-row__values">
              <span>{{ t('settings.systemMetrics.deployment.current', {value: check.currentValue || '—'}) }}</span>
              <span>{{ t('settings.systemMetrics.deployment.recommended', {value: check.recommendedValue}) }}</span>
            </div>
          </li>
        </ul>
      </section>

      <section class="setting-block setting-block--compact">
        <div class="metrics-grid">
        <article class="metric-card" :class="healthOk ? 'tone-ok' : 'tone-danger'">
          <span class="metric-card__label">{{ t('settings.systemMetrics.health') }}</span>
          <strong class="metric-card__value">{{ metrics?.healthStatus ?? '—' }}</strong>
          <span class="metric-card__hint">
            {{ health?.result?.latencyMs != null
              ? t('settings.systemMetrics.latency', { ms: health.result.latencyMs })
              : t('settings.systemMetrics.latencyUnknown') }}
          </span>
        </article>

        <article class="metric-card">
          <span class="metric-card__label">{{ t('settings.systemMetrics.uptime') }}</span>
          <strong class="metric-card__value">{{ formatDuration(metrics?.uptimeMs ?? 0) }}</strong>
          <span class="metric-card__hint">{{ t('settings.systemMetrics.processUptime') }}</span>
        </article>

        <article class="metric-card">
          <span class="metric-card__label">{{ t('settings.systemMetrics.jdbcPools') }}</span>
          <strong class="metric-card__value">{{ metrics?.datawise.jdbcPoolsActive ?? '—' }}</strong>
          <span class="metric-card__hint">{{ t('settings.systemMetrics.jdbcPoolsHint') }}</span>
        </article>

        <article class="metric-card">
          <span class="metric-card__label">{{ t('settings.systemMetrics.explorerSessions') }}</span>
          <strong class="metric-card__value">{{ metrics?.datawise.explorerSchemaSessionsActive ?? '—' }}</strong>
          <span class="metric-card__hint">{{ t('settings.systemMetrics.explorerSessionsHint') }}</span>
        </article>

        <article class="metric-card">
          <span class="metric-card__label">{{ t('settings.systemMetrics.explorerCacheShortCircuit') }}</span>
          <strong class="metric-card__value">{{ metrics?.datawise.explorerLoadChildrenNotModifiedShortCircuit ?? '—' }}</strong>
          <span class="metric-card__hint">{{ t('settings.systemMetrics.explorerCacheShortCircuitHint') }}</span>
        </article>

        <article class="metric-card">
          <span class="metric-card__label">{{ t('settings.systemMetrics.explorerCacheAfterLoad') }}</span>
          <strong class="metric-card__value">{{ metrics?.datawise.explorerLoadChildrenNotModifiedAfterLoad ?? '—' }}</strong>
          <span class="metric-card__hint">{{ t('settings.systemMetrics.explorerCacheAfterLoadHint') }}</span>
        </article>

        <article class="metric-card">
          <span class="metric-card__label">{{ t('settings.systemMetrics.explorerCacheModified') }}</span>
          <strong class="metric-card__value">{{ metrics?.datawise.explorerLoadChildrenModified ?? '—' }}</strong>
          <span class="metric-card__hint">{{ t('settings.systemMetrics.explorerCacheModifiedHint') }}</span>
        </article>
        </div>
      </section>

      <section class="setting-block metrics-section">
        <div class="section-head">
          <h3>{{ t('settings.systemMetrics.jvmTitle') }}</h3>
          <span class="section-meta">
            {{ t('settings.systemMetrics.collectedAt', { time: formatMetricTime(metrics?.collectedAt) }) }}
          </span>
        </div>

        <div class="jvm-panel">
          <div class="jvm-row">
            <span>{{ t('settings.systemMetrics.heapUsed') }}</span>
            <strong>
              {{ formatBytes(metrics?.jvm.heapUsedBytes ?? 0) }}
              <template v-if="metrics?.jvm.heapMaxBytes">
                / {{ formatBytes(metrics.jvm.heapMaxBytes) }}
              </template>
            </strong>
          </div>
          <div class="heap-bar" :data-tone="heapTone">
            <div class="heap-bar__fill" :style="{ width: heapBarWidth }"/>
          </div>
          <div class="jvm-foot">
            <span>{{ t('settings.systemMetrics.heapUsage', { value: formatPercent(heapUsagePercent) }) }}</span>
            <span>{{ t('settings.systemMetrics.processors', { n: metrics?.jvm.availableProcessors ?? '—' }) }}</span>
          </div>
        </div>
      </section>

      <section class="metrics-section">
        <div class="section-head">
          <h3>{{ t('settings.systemMetrics.poolsTitle') }}</h3>
          <span class="section-meta">{{ t('settings.systemMetrics.poolsCount', { n: metrics?.jdbcPools.length ?? 0 }) }}</span>
        </div>

        <p v-if="!metrics?.jdbcPools.length" class="metrics-empty">
          {{ t('settings.systemMetrics.noPools') }}
        </p>

        <div v-else class="pool-table-wrap">
          <table class="pool-table">
            <thead>
              <tr>
                <th>{{ t('settings.systemMetrics.poolConnection') }}</th>
                <th>{{ t('settings.systemMetrics.poolActive') }}</th>
                <th>{{ t('settings.systemMetrics.poolIdle') }}</th>
                <th>{{ t('settings.systemMetrics.poolPending') }}</th>
                <th>{{ t('settings.systemMetrics.poolMax') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pool in metrics.jdbcPools" :key="pool.poolName">
                <td>
                  <div class="pool-id">{{ pool.connectionId }}</div>
                  <div class="pool-name">{{ pool.poolName }}</div>
                </td>
                <td>{{ pool.activeConnections ?? '—' }}</td>
                <td>{{ pool.idleConnections ?? '—' }}</td>
                <td :class="{ 'is-warn': (pool.pendingThreads ?? 0) > 0 }">
                  {{ pool.pendingThreads ?? '—' }}
                </td>
                <td>{{ pool.maxConnections ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="setting-block metrics-section metrics-footnote">
        <p>{{ t('settings.systemMetrics.footnote') }}</p>
        <code>{{ health?.endpoint ?? endpointLabel }}</code>
      </section>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
.deployment-hint {
  margin: 0 0 var(--dw-space-3);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
  line-height: var(--dw-leading);
}

.deployment-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
}

.deployment-row {
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  padding: var(--dw-space-3);
  background: var(--dw-bg-panel);
}

.deployment-row[data-tone='warn'] {
  border-color: color-mix(in srgb, var(--dw-warning) 45%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-warning) 8%, var(--dw-bg-panel));
}

.deployment-row[data-tone='ok'] {
  border-color: color-mix(in srgb, var(--dw-success) 35%, var(--dw-border-light));
}

.deployment-row__main {
  display: flex;
  justify-content: space-between;
  gap: var(--dw-space-3);
  align-items: baseline;
}

.deployment-row__main strong {
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
}

.deployment-row__status {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.deployment-row__values {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2) var(--dw-space-4);
  margin-top: var(--dw-space-2);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
}
</style>
