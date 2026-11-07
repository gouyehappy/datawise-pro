<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {DwButton, StatusPill} from '@/core/components'
import {useMigrationWizard} from '@/features/workspace/composables/useMigrationWizardInject'

const {t} = useI18n()
const w = useMigrationWizard()
</script>

<template>
  <div class="migration-flow-panel">
    <div
        v-if="w.completionSummary && w.completionStatusKey"
        class="table-migration__completion"
        :class="`table-migration__completion--${w.migrationRunRecord?.status ?? 'success'}`"
    >
      <strong>{{ t(w.completionStatusKey) }}</strong>
      <span>
        {{
          t('explorer.tableMigrationWizard.completionSummary', {
            tables: w.completionSummary.tables,
            rows: w.completionSummary.rows,
            failed: w.completionSummary.failed,
          })
        }}
      </span>
    </div>

    <section v-if="w.migrationRunRecord || w.migrationRunLogs.length" class="migration-run">
      <header class="migration-run__head">
        <h3>{{ t('explorer.tableMigrationWizard.migrationRunTitle') }}</h3>
        <div class="migration-run__actions">
          <DwButton
              v-if="w.canResumeFromWizard"
              variant="primary"
              size="sm"
              :loading="w.resuming"
              @click="w.resumeFromCheckpoint()"
          >
            {{ t('explorer.tableMigrationWizard.resumeFromCheckpoint') }}
          </DwButton>
          <DwButton
              variant="secondary"
              size="sm"
              @click="w.openMigrationTasksPanel(w.migrationRunRecord?.id)"
          >
            {{ t('explorer.tableMigrationWizard.viewTaskPanel') }}
          </DwButton>
          <DwButton
              v-if="w.migrationRunRecord"
              variant="secondary"
              size="sm"
              @click="w.copyMigrationLog"
          >
            {{ t('explorer.tableMigrationWizard.copyLog') }}
          </DwButton>
          <DwButton
              v-if="w.migrationRunRecord"
              variant="secondary"
              size="sm"
              @click="w.downloadMigrationReport"
          >
            {{ t('explorer.tableMigrationWizard.downloadReport') }}
          </DwButton>
        </div>
      </header>

      <dl v-if="w.migrationRunRecord" class="migration-run__meta">
        <div>
          <dt>{{ t('explorer.tableMigrationWizard.runId') }}</dt>
          <dd>{{ w.migrationRunRecord.id.slice(0, 8) }}…</dd>
        </div>
        <div>
          <dt>{{ t('explorer.tableMigrationWizard.runStartedAt') }}</dt>
          <dd>{{ w.formatTimestamp(w.migrationRunRecord.startedAt) }}</dd>
        </div>
        <div>
          <dt>{{ t('explorer.tableMigrationWizard.runDuration') }}</dt>
          <dd>{{ w.formatDuration(w.migrationRunRecord.durationMs) }}</dd>
        </div>
      </dl>

      <p class="migration-run__panel-hint">{{ t('explorer.tableMigrationWizard.taskPanelHint') }}</p>
      <p v-if="w.migrationRunRecord?.status === 'paused'" class="migration-run__panel-hint">
        {{ t('explorer.tableMigrationWizard.pausedResumeHintWizard') }}
      </p>
      <p
          v-else-if="w.migrationRunRecord?.status === 'failed' || w.migrationRunRecord?.status === 'partial'"
          class="migration-run__panel-hint"
      >
        {{ t('explorer.tableMigrationWizard.failedCheckpointHintWizard') }}
      </p>
    </section>

    <section v-if="w.migrationResults.length" class="migration-results">
      <header class="migration-results__head">
        <h3>{{ t('explorer.tableMigrationWizard.migrationResultTitle') }}</h3>
      </header>
      <table class="detail-table">
        <thead>
          <tr>
            <th>{{ t('explorer.tableMigrationWizard.preflightTable') }}</th>
            <th>{{ t('explorer.tableMigrationWizard.validationMigratedRows') }}</th>
            <th>{{ t('explorer.tableMigrationWizard.preflightSourceRows') }}</th>
            <th>{{ t('explorer.tableMigrationWizard.validationTargetBefore') }}</th>
            <th>{{ t('explorer.tableMigrationWizard.validationTargetAfter') }}</th>
            <th>{{ t('explorer.tableMigrationWizard.preflightStatus') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
              v-for="row in w.migrationResults"
              :key="row.tableName"
              :class="row.rowCountValidation === 'mismatch' ? 'is-blocked' : ''"
          >
            <td>{{ row.tableName }}</td>
            <td>{{ w.formatRowCount(row.rowsMigrated) }}</td>
            <td>{{ w.formatRowCount(row.sourceRowCount ?? null) }}</td>
            <td>{{ w.formatRowCount(row.targetRowCountBefore ?? null) }}</td>
            <td>{{ w.formatRowCount(row.targetRowCountAfter ?? null) }}</td>
            <td>
              <StatusPill :status="row.rowCountValidation ?? ''" domain="validation">
                {{ w.formatValidation(row.rowCountValidation) }}
              </StatusPill>
              <p v-if="row.message" class="migration-results__message">{{ row.message }}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
