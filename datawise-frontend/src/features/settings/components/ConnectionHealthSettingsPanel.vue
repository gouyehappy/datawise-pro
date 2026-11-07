<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwCheckbox} from '@/core/components'
import DbTypeIcon from '@/core/components/DbTypeIcon.vue'
import {DB_TYPE_ICON_SIZE} from '@/features/connection/constants/db-type-icon-sizes'
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
import SettingsSectionCard from '@/features/settings/components/SettingsSectionCard.vue'
import SettingsSegmentTabs from '@/features/settings/components/SettingsSegmentTabs.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import type {ConnectionHealthProbeIntervalMinutes} from '@/shared/config/app-config.types'

const {t} = useI18n()
const appConfig = useAppConfigStore()
const explorer = useExplorerStore()
const {readOnly, hint, denyIfReadOnly} = useResourceWriteGuard(UserResource.AppConfig)

const probeIntervals: ConnectionHealthProbeIntervalMinutes[] = [1, 5, 15, 30]

const healthPrefs = computed(() => appConfig.connectionHealthPreferences)
const connectionRows = computed(() =>
    extractDashboardConnections(explorer.tree, explorer.connectionHealthById),
)
const connectionIds = computed(() => collectConnectionIds(explorer.tree))

const probeIntervalTabs = computed(() =>
    probeIntervals.map((minutes) => ({
        id: String(minutes),
        label: t('settings.connectionHealth.probeIntervalMinutes', {n: minutes}),
    })),
)

function isWatched(connectionId: string): boolean {
    return isConnectionWatchedInUi(connectionId, connectionIds.value, healthPrefs.value)
}

function onToggleWatch(connectionId: string) {
    if (denyIfReadOnly()) return
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
      <SettingsSectionCard
          :title="t('settings.connectionHealth.sectionAlertsTitle')"
          :hint="t('settings.connectionHealth.sectionAlertsHint')"
          icon="settings-connection-health"
          tone="primary"
      >
        <DwCheckbox
            block
            class="health-toggle"
            :model-value="healthPrefs.alertsEnabled"
            @update:model-value="patchHealth({ alertsEnabled: $event })"
        >
          <strong>{{ t('settings.connectionHealth.alertsEnabled') }}</strong>
          <span class="hint">{{ t('settings.connectionHealth.alertsEnabledHint') }}</span>
        </DwCheckbox>

        <DwCheckbox
            block
            class="health-toggle"
            :model-value="healthPrefs.drawerAlertsEnabled !== false"
            @update:model-value="patchHealth({ drawerAlertsEnabled: $event })"
        >
          <strong>{{ t('settings.connectionHealth.drawerAlertsEnabled') }}</strong>
          <span class="hint">{{ t('settings.connectionHealth.drawerAlertsEnabledHint') }}</span>
        </DwCheckbox>

        <DwCheckbox
            block
            class="health-toggle"
            :model-value="healthPrefs.slowQueryAlertsEnabled !== false"
            @update:model-value="patchHealth({ slowQueryAlertsEnabled: $event })"
        >
          <strong>{{ t('settings.connectionHealth.slowQueryAlertsEnabled') }}</strong>
          <span class="hint">{{ t('settings.connectionHealth.slowQueryAlertsEnabledHint') }}</span>
        </DwCheckbox>
      </SettingsSectionCard>

      <SettingsSectionCard
          :title="t('settings.connectionHealth.sectionProbeTitle')"
          :hint="t('settings.connectionHealth.sectionProbeHint')"
          icon="zap"
          tone="sky"
      >
        <div class="health-field">
          <span class="health-field__label">{{ t('settings.connectionHealth.probeInterval') }}</span>
          <span class="hint">{{ t('settings.connectionHealth.probeIntervalHint') }}</span>
          <SettingsSegmentTabs
              class="health-interval-tabs"
              variant="inline"
              :model-value="String(healthPrefs.probeIntervalMinutes)"
              :tabs="probeIntervalTabs"
              :aria-label="t('settings.connectionHealth.probeInterval')"
              @update:model-value="patchHealth({ probeIntervalMinutes: Number($event) as ConnectionHealthProbeIntervalMinutes })"
          />
        </div>

        <DwCheckbox
            block
            class="health-toggle"
            :model-value="healthPrefs.alertOnOkToError"
            @update:model-value="patchHealth({ alertOnOkToError: $event })"
        >
          <strong>{{ t('settings.connectionHealth.alertOnOkToError') }}</strong>
          <span class="hint">{{ t('settings.connectionHealth.alertOnOkToErrorHint') }}</span>
        </DwCheckbox>

        <DwCheckbox
            block
            class="health-toggle"
            :model-value="healthPrefs.alertOnUnknownToError"
            @update:model-value="patchHealth({ alertOnUnknownToError: $event })"
        >
          <strong>{{ t('settings.connectionHealth.alertOnUnknownToError') }}</strong>
          <span class="hint">{{ t('settings.connectionHealth.alertOnUnknownToErrorHint') }}</span>
        </DwCheckbox>
      </SettingsSectionCard>

      <SettingsSectionCard
          :title="t('settings.connectionHealth.sectionWatchTitle')"
          :hint="t('settings.connectionHealth.sectionWatchHint')"
          icon="database"
          tone="violet"
          :badge="String(connectionRows.length)"
      >
        <p v-if="!connectionRows.length" class="hint health-empty">
          {{ t('settings.connectionHealth.noConnections') }}
        </p>
        <div v-else class="watch-list">
          <DwCheckbox
              v-for="conn in connectionRows"
              :key="conn.id"
              class="watch-item"
              :model-value="isWatched(conn.id)"
              @update:model-value="() => onToggleWatch(conn.id)"
          >
            <DbTypeIcon :db-type="conn.dbType" :size="DB_TYPE_ICON_SIZE.compact"/>
            <span class="watch-item__name">{{ conn.name }}</span>
            <span class="watch-item__type">{{ conn.dbType }}</span>
          </DwCheckbox>
        </div>
      </SettingsSectionCard>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
.health-interval-tabs {
  margin-top: clamp(8px, 1vmin, 10px);
}
</style>
