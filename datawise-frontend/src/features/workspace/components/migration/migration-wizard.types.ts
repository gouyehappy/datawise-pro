import type {InjectionKey} from 'vue'
import type {useTableMigrationWizard} from '@/features/workspace/composables/useTableMigrationWizard'

export type MigrationFlowStep = 'configure' | 'preflight' | 'running' | 'complete'

export type MigrationWizardContext = ReturnType<typeof useTableMigrationWizard>

export const MIGRATION_WIZARD_KEY: InjectionKey<MigrationWizardContext> = Symbol('migration-wizard')
