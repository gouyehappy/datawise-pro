<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {TeamAuditLog, TeamAuditLogQuery, TeamMember} from '@/core/types'
import {DwButton, DwCheckbox, DwSelect} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useTeamStore} from '@/features/team/stores/team-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {
    buildTeamAuditExportFileName,
    downloadTeamAuditExport,
    serializeAuditLogsToCsv,
    serializeAuditLogsToJson,
    toAuditQueryInstantFromDateInput,
} from '@/features/team/services/team-audit-export.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    teamId: string
    teamName: string
    members: TeamMember[]
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const teamStore = useTeamStore()
const entitlement = useEntitlementStore()

const loading = ref(false)
const logs = ref<TeamAuditLog[]>([])
const actorUserId = ref<number | ''>('')
const sinceDate = ref('')
const untilDate = ref('')
const includeFullSql = ref(false)

const actorSelect = computed({
    get: () => (actorUserId.value === '' ? '' : String(actorUserId.value)),
    set: (v: string) => {
        actorUserId.value = v === '' ? '' : Number(v)
    },
})

function onIncludeFullSqlChange(next: boolean) {
    if (next && !entitlement.guardPack('pack.security', 'security.audit.pro')) {
        includeFullSql.value = false
        return
    }
    includeFullSql.value = next
}

const actorOptions = computed<SelectOption[]>(() => [
    {value: '', label: t('team.audit.allActors')},
    ...props.members.map((member) => ({
        value: String(member.userId),
        label: member.userName,
    })),
])

function buildQuery(): TeamAuditLogQuery {
    return {
        actorUserId: actorUserId.value === '' ? undefined : actorUserId.value,
        since: toAuditQueryInstantFromDateInput(sinceDate.value, false),
        until: toAuditQueryInstantFromDateInput(untilDate.value, true),
        limit: 500,
    }
}

async function reloadLogs() {
    loading.value = true
    try {
        logs.value = await teamStore.fetchAuditLogs(props.teamId, buildQuery())
    } catch (error) {
        const message = resolveCaughtApiErrorMessage(error, t, 'team.auditLoadFailed')
        layout.showErrorToast(message)
        logs.value = []
    } finally {
        loading.value = false
    }
}

async function exportLogs(format: 'csv' | 'json') {
    if (includeFullSql.value && !entitlement.guardPack('pack.security', 'security.audit.pro')) {
        return
    }
    const fileName = buildTeamAuditExportFileName(props.teamName, format)
    try {
        await teamStore.exportAuditLogs(props.teamId, {
            format,
            actorUserId: actorUserId.value === '' ? undefined : actorUserId.value,
            since: toAuditQueryInstantFromDateInput(sinceDate.value, false),
            until: toAuditQueryInstantFromDateInput(untilDate.value, true),
            includeFullSql: includeFullSql.value,
            fileName,
        })
        layout.startExport(fileName)
        return
    } catch (error) {
        if (!logs.value.length) {
            layout.showErrorToast(resolveCaughtApiErrorMessage(error, t, 'team.audit.exportEmpty'))
            return
        }
    }
    const options = {includeFullSql: includeFullSql.value}
    if (format === 'csv') {
        downloadTeamAuditExport(
            serializeAuditLogsToCsv(logs.value, options),
            fileName,
            'text/csv;charset=utf-8',
        )
    } else {
        downloadTeamAuditExport(
            serializeAuditLogsToJson(logs.value, options),
            fileName,
            'application/json;charset=utf-8',
        )
    }
    layout.startExport(fileName)
}

function formatDate(value: string) {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

watch(
    () => [props.teamId, actorUserId.value, sinceDate.value, untilDate.value] as const,
    () => {
        if (!props.teamId) return
        void reloadLogs()
    },
    {immediate: true},
)
</script>

<template>
  <div class="tab-panel audit-panel">
    <header class="audit-toolbar">
      <div class="audit-filters">
        <label class="audit-field">
          <span>{{ t('team.audit.actorFilter') }}</span>
          <DwSelect
              v-model="actorSelect"
              size="sm"
              :options="actorOptions"
          />
        </label>

        <label class="audit-field">
          <span>{{ t('team.audit.sinceFilter') }}</span>
          <input v-model="sinceDate" class="audit-input" type="date" />
        </label>

        <label class="audit-field">
          <span>{{ t('team.audit.untilFilter') }}</span>
          <input v-model="untilDate" class="audit-input" type="date" />
        </label>
      </div>

      <div class="audit-actions">
        <DwCheckbox
            :model-value="includeFullSql"
            block
            class="audit-toggle"
            @update:model-value="onIncludeFullSqlChange"
        >
          {{ t('team.audit.includeFullSql') }}
        </DwCheckbox>
        <DwButton variant="secondary" size="sm" @click="exportLogs('csv')">
          {{ t('team.audit.exportCsv') }}
        </DwButton>
        <DwButton variant="secondary" size="sm" @click="exportLogs('json')">
          {{ t('team.audit.exportJson') }}
        </DwButton>
      </div>
    </header>

    <p v-if="loading" class="mp-empty">{{ t('team.loading') }}</p>
    <p v-else-if="!logs.length" class="mp-empty">{{ t('team.emptyAudit') }}</p>
    <ul v-else class="detail-list audit-list">
      <li v-for="log in logs" :key="log.id" class="detail-list__row audit-list__row">
        <div>
          <div class="detail-list__name">{{ log.action }}</div>
          <div class="detail-list__meta">
            {{ log.actorUserName }} · {{ formatDate(log.createdAt) }}
          </div>
          <div v-if="log.detail" class="audit-detail">
            {{
              includeFullSql
                  ? log.detail
                  : (log.detail.length > 120 ? `${log.detail.slice(0, 120)}…` : log.detail)
            }}
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.audit-panel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-6);
}

.audit-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--dw-space-6);
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
}

.audit-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-md);
  min-width: 0;
}

.audit-field {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-xs);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.audit-input {
  min-width: 140px;
  padding: var(--dw-pad-tight);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg);
  color: var(--dw-text);
  font: inherit;
}

.audit-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
}

.audit-toggle {
  margin-right: var(--dw-space-2);
}

.detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.detail-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
}

.audit-list__row {
  align-items: flex-start;
}

.detail-list__name {
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.detail-list__meta {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  margin-top: var(--dw-space-1);
}

.audit-detail {
  margin-top: var(--dw-space-2);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
