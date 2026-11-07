import {inject} from 'vue'
import {MIGRATION_WIZARD_KEY, type MigrationWizardContext} from '@/features/workspace/components/migration/migration-wizard.types'

export function useMigrationWizard(): MigrationWizardContext {
    const ctx = inject(MIGRATION_WIZARD_KEY)
    if (!ctx) {
        throw new Error('useMigrationWizard must be used within TableMigrationTab')
    }
    return ctx
}
