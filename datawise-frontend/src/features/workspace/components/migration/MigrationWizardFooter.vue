<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {DwButton} from '@/core/components'
import {useMigrationWizard} from '@/features/workspace/composables/useMigrationWizardInject'

const {t} = useI18n()
const w = useMigrationWizard()
</script>

<template>
  <footer class="table-migration__footer">
    <p v-if="w.footerHint" class="table-migration__footer-hint">{{ w.footerHint }}</p>

    <div class="table-migration__footer-actions">
      <template v-if="w.wizardStep === 'configure'">
        <DwButton variant="primary" :disabled="!w.canCheck" @click="w.goToPreflightStep">
          {{ t('explorer.tableMigrationWizard.checkAndContinue') }}
        </DwButton>
      </template>

      <template v-else-if="w.wizardStep === 'preflight'">
        <DwButton variant="secondary" :disabled="w.running" @click="w.backToConfigureStep">
          {{ t('explorer.tableMigrationWizard.back') }}
        </DwButton>
        <DwButton
            variant="ghost"
            :disabled="!w.canCheck || w.preflightLoading || w.running"
            :loading="w.preflightLoading"
            @click="w.runPreflight"
        >
          {{ w.preflightLoading ? t('explorer.tableMigrationWizard.checking') : t('explorer.tableMigrationWizard.refreshPreflight') }}
        </DwButton>
        <DwButton
            variant="primary"
            :disabled="!w.canStartMigration || w.running"
            :loading="w.preflightLoading"
            @click="w.startMigration"
        >
          {{ w.migrateActionLabel }}
        </DwButton>
      </template>

      <template v-else-if="w.wizardStep === 'running'">
        <DwButton variant="secondary" @click="w.openMigrationTasksPanel()">
          {{ t('explorer.tableMigrationWizard.viewTaskPanel') }}
        </DwButton>
        <DwButton
            v-if="w.canPauseMigration"
            variant="secondary"
            :disabled="w.pausing || w.cancelling"
            :loading="w.pausing"
            @click="w.pauseActiveMigration"
        >
          {{ t('explorer.tableMigrationWizard.pauseMigration') }}
        </DwButton>
        <DwButton
            v-if="w.canCancelMigration"
            variant="primary"
            :disabled="w.cancelling"
            :loading="w.cancelling"
            @click="w.cancelActiveMigration"
        >
          {{ t('explorer.tableMigrationWizard.cancelMigration') }}
        </DwButton>
      </template>

      <template v-else-if="w.wizardStep === 'complete'">
        <DwButton variant="secondary" @click="w.backToConfigureStep">
          {{ t('explorer.tableMigrationWizard.backConfigure') }}
        </DwButton>
        <DwButton variant="primary" @click="w.startNewMigration">
          {{ t('explorer.tableMigrationWizard.startNew') }}
        </DwButton>
      </template>
    </div>
  </footer>
</template>
