<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {SettingsRow, SettingsSwitch} from '@/core/components'
import SettingsSelect from '@/core/components/SettingsSelect.vue'
import {
    collectConnectionIds,
    extractDashboardConnections,
} from '@/features/dashboard/services/dashboard-summary.service'
import {
    isConnectionWatchedInUi,
    toggleWatchedConnectionId,
} from '@/features/explorer/services/connection-health-alert.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsGroup from '@/features/settings/components/SettingsGroup.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import type {
    ConnectionHealthPreferences,
    ConnectionHealthProbeIntervalMinutes,
} from '@/shared/config/app-config.types'

const {t} = useI18n()
const appConfig = useAppConfigStore()
const explorer = useExplorerStore()
const {readOnly, hint, denyIfReadOnly} = useResourceWriteGuard(UserResource.AppConfig)

const probeIntervals: ConnectionHealthProbeIntervalMinutes[] = [1, 5, 15, 30]

const healthPrefs = computed(
    () => appConfig.connectionHealthPreferences as ConnectionHealthPreferences,
)
const connectionRows = computed(() =>
    extractDashboardConnections(explorer.tree, explorer.connectionHealthById),
)
const connectionIds = computed(() => collectConnectionIds(explorer.tree))

const probeIntervalOptions = computed(() =>
    probeIntervals.map((minutes) => ({
        value: String(minutes),
        label: t('settings.connectionHealth.probeIntervalMinutes', {n: minutes}),
    })),
)

function isWatched(connectionId: string): boolean {
    return isConnectionWatchedInUi(connectionId, connectionIds.value, healthPrefs.value)
}

function onToggleWatch(connectionId: string, next: boolean) {
    if (denyIfReadOnly()) return
    if (isWatched(connectionId) === next) return
    appConfig.patchConnectionHealth({
        watchedConnectionIds: toggleWatchedConnectionId(
            connectionId,
            connectionIds.value,
            healthPrefs.value,
        ),
    })
}

function patchHealth(patch: Parameters<typeof appConfig.patchConnectionHealth>[0]) {
    if (denyIfReadOnly()) return
    appConfig.patchConnectionHealth(patch)
}

function onProbeIntervalChange(value: string) {
    patchHealth({
        probeIntervalMinutes: Number(value) as ConnectionHealthProbeIntervalMinutes,
    })
}
</script>

<template>
  <SettingsPageShell
      :title="t('settings.connectionHealth.title')"
      :subtitle="t('settings.connectionHealth.subtitle')"
      :readonly="readOnly"
      :readonly-hint="hint"
  >
    <template #tips>
      <SettingsTipsCard
          :title="t('settings.connectionHealth.title')"
          :content="t('settings.connectionHealth.subtitle')"
          icon="settings-connection-health"
      />
    </template>

    <div class="settings-groups">
      <SettingsGroup
          :title="t('settings.connectionHealth.sectionAlertsTitle')"
          :hint="t('settings.connectionHealth.sectionAlertsHint')"
      >
        <SettingsSwitch
            :label="t('settings.connectionHealth.alertsEnabled')"
            :hint="t('settings.connectionHealth.alertsEnabledHint')"
            :model-value="healthPrefs.alertsEnabled"
            :disabled="readOnly"
            @update:model-value="patchHealth({ alertsEnabled: $event })"
        />
        <SettingsSwitch
            :label="t('settings.connectionHealth.drawerAlertsEnabled')"
            :hint="t('settings.connectionHealth.drawerAlertsEnabledHint')"
            :model-value="healthPrefs.drawerAlertsEnabled !== false"
            :disabled="readOnly"
            @update:model-value="patchHealth({ drawerAlertsEnabled: $event })"
        />
        <SettingsSwitch
            :label="t('settings.connectionHealth.slowQueryAlertsEnabled')"
            :hint="t('settings.connectionHealth.slowQueryAlertsEnabledHint')"
            :model-value="healthPrefs.slowQueryAlertsEnabled !== false"
            :disabled="readOnly"
            @update:model-value="patchHealth({ slowQueryAlertsEnabled: $event })"
        />
      </SettingsGroup>

      <SettingsGroup
          :title="t('settings.connectionHealth.sectionProbeTitle')"
          :hint="t('settings.connectionHealth.sectionProbeHint')"
      >
        <SettingsRow
            :label="t('settings.connectionHealth.probeInterval')"
            :hint="t('settings.connectionHealth.probeIntervalHint')"
            :disabled="readOnly"
        >
          <SettingsSelect
              id="connection-health-probe-interval"
              :model-value="String(healthPrefs.probeIntervalMinutes)"
              :options="probeIntervalOptions"
              :disabled="readOnly"
              @update:model-value="onProbeIntervalChange"
          />
        </SettingsRow>
        <SettingsSwitch
            :label="t('settings.connectionHealth.alertOnOkToError')"
            :hint="t('settings.connectionHealth.alertOnOkToErrorHint')"
            :model-value="healthPrefs.alertOnOkToError"
            :disabled="readOnly"
            @update:model-value="patchHealth({ alertOnOkToError: $event })"
        />
        <SettingsSwitch
            :label="t('settings.connectionHealth.alertOnUnknownToError')"
            :hint="t('settings.connectionHealth.alertOnUnknownToErrorHint')"
            :model-value="healthPrefs.alertOnUnknownToError"
            :disabled="readOnly"
            @update:model-value="patchHealth({ alertOnUnknownToError: $event })"
        />
      </SettingsGroup>

      <SettingsGroup
          :title="t('settings.connectionHealth.sectionWatchTitle')"
          :hint="t('settings.connectionHealth.sectionWatchHint')"
      >
        <p v-if="!connectionRows.length" class="settings-section__block-hint health-empty">
          {{ t('settings.connectionHealth.noConnections') }}
        </p>
        <SettingsSwitch
            v-for="conn in connectionRows"
            :key="conn.id"
            :label="conn.name"
            :hint="conn.dbType"
            :model-value="isWatched(conn.id)"
            :disabled="readOnly"
            @update:model-value="(v) => onToggleWatch(conn.id, v)"
        />
      </SettingsGroup>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
.health-empty {
  padding: var(--dw-space-3) 0;
}
</style>
