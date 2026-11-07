<script setup lang="ts">
import {defineAsyncComponent, provide} from 'vue'
import {useI18n} from 'vue-i18n'
import type {WorkspaceTab} from '@/core/types'
import {DwInlineAlert, EmptyState} from '@/core/components'
import MigrationWizardSteps from '@/features/workspace/components/migration/MigrationWizardSteps.vue'
import MigrationConfigureStep from '@/features/workspace/components/migration/MigrationConfigureStep.vue'
import MigrationPreflightStep from '@/features/workspace/components/migration/MigrationPreflightStep.vue'
import MigrationRunningStep from '@/features/workspace/components/migration/MigrationRunningStep.vue'
import MigrationCompleteStep from '@/features/workspace/components/migration/MigrationCompleteStep.vue'
import MigrationWizardFooter from '@/features/workspace/components/migration/MigrationWizardFooter.vue'
import {MIGRATION_WIZARD_KEY, type MigrationFlowStep} from '@/features/workspace/components/migration/migration-wizard.types'
import {useTableMigrationWizard} from '@/features/workspace/composables/useTableMigrationWizard'

const props = defineProps<{ tab: WorkspaceTab }>()

const SubmitProductionApprovalDialog = defineAsyncComponent(
    () => import('@/features/workspace/components/SubmitProductionApprovalDialog.vue'),
)

const {t} = useI18n()
const wizard = useTableMigrationWizard(props.tab)

provide(MIGRATION_WIZARD_KEY, wizard)
</script>

<template>
  <div
      v-if="wizard.source"
      class="table-migration dw-workbench-page"
      data-wb-recipe="wb-extension"
      :class="{ 'table-migration--running': wizard.running }"
  >
    <header class="table-migration__toolbar">
      <div class="table-migration__toolbar-main">
        <h2>{{ t('explorer.tableMigrationWizard.title') }}</h2>
        <p v-if="wizard.wizardStep === 'configure'" class="table-migration__subtitle">
          {{ t('explorer.tableMigrationWizard.subtitle') }}
        </p>
        <MigrationWizardSteps
            :steps="wizard.wizardSteps"
            :active-step="wizard.wizardStep"
            :ariaLabel="t('explorer.tableMigrationWizard.flowTitle')"
            :is-step-accessible="(id) => wizard.isFlowStepAccessible(id as MigrationFlowStep)"
            :is-step-completed="(id) => wizard.isFlowStepCompleted(id as MigrationFlowStep)"
            @step-click="wizard.goToFlowStep"
        />
        <DwInlineAlert :message="wizard.running ? null : wizard.formError"/>
      </div>
    </header>

    <div
        class="table-migration__body"
        :class="{ 'table-migration__body--canvas': wizard.wizardStep === 'configure' }"
    >
      <MigrationConfigureStep v-show="wizard.wizardStep === 'configure'"/>
      <MigrationPreflightStep v-show="wizard.wizardStep === 'preflight'"/>
      <MigrationRunningStep v-show="wizard.wizardStep === 'running'"/>
      <MigrationCompleteStep v-show="wizard.wizardStep === 'complete'"/>
    </div>

    <MigrationWizardFooter/>

    <SubmitProductionApprovalDialog
        v-model:open="wizard.productionApprovalDialogOpen"
        :saving="wizard.productionApprovalSubmitting"
        :error="wizard.productionApprovalError"
        :sql="wizard.productionApprovalSql"
        :connection-name="wizard.targetConnectionLabel"
        :database="wizard.form.targetDatabase"
        :teams="wizard.productionApprovalTeams"
        @submit="wizard.onSubmitProductionApproval"
    />
  </div>
  <EmptyState v-else embedded :title="t('explorer.tableMigrationContextMissing')"/>
</template>
