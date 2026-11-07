import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildInitialFederatedWizardSources,
    canAccessFederatedWizardStep,
    createDefaultFederatedWizardForm,
    createFederatedWizardSourceDraft,
    reorderFederatedWizardSources,
    suggestFederatedAlias,
    toFederatedViewSources,
    validateFederatedWizardStep,
} from '@/features/platform/services/federated-view-wizard.service'

describe('federated-view-wizard.service', () => {
    it('suggestFederatedAlias avoids duplicates', () => {
        assert.equal(suggestFederatedAlias('sales_db', []), 'sales_db')
        assert.equal(suggestFederatedAlias('sales_db', ['sales_db']), 'sales_db2')
    })

    it('reorderFederatedWizardSources moves items', () => {
        const sources = [
            createFederatedWizardSourceDraft({
                connectionId: 'c1',
                connectionLabel: 'A',
                database: 'db1',
                alias: 'a',
            }),
            createFederatedWizardSourceDraft({
                connectionId: 'c2',
                connectionLabel: 'B',
                database: 'db2',
                alias: 'b',
            }),
        ]
        const reordered = reorderFederatedWizardSources(sources, 1, 0)
        assert.equal(reordered[0].alias, 'b')
        assert.equal(reordered[1].alias, 'a')
    })

    it('validateFederatedWizardStep enforces two unique sources', () => {
        const form = createDefaultFederatedWizardForm({
            sources: [
                createFederatedWizardSourceDraft({
                    connectionId: 'c1',
                    connectionLabel: 'A',
                    database: 'db1',
                    alias: 'a',
                }),
            ],
        })
        assert.equal(validateFederatedWizardStep('sources', form), 'needTwoSources')

        form.sources.push(
            createFederatedWizardSourceDraft({
                connectionId: 'c2',
                connectionLabel: 'B',
                database: 'db2',
                alias: 'a',
            }),
        )
        assert.equal(validateFederatedWizardStep('sources', form), 'aliasDuplicate')
    })

    it('canAccessFederatedWizardStep gates later steps', () => {
        const form = createDefaultFederatedWizardForm({
            sources: [
                createFederatedWizardSourceDraft({
                    connectionId: 'c1',
                    connectionLabel: 'A',
                    database: 'db1',
                    alias: 'a',
                }),
                createFederatedWizardSourceDraft({
                    connectionId: 'c2',
                    connectionLabel: 'B',
                    database: 'db2',
                    alias: 'b',
                }),
            ],
            sql: 'SELECT * FROM @a JOIN @b ON a.id = b.a_id',
            name: 'Joined view',
        })
        assert.equal(canAccessFederatedWizardStep('sources', form), true)
        assert.equal(canAccessFederatedWizardStep('generate', form), true)
        assert.equal(canAccessFederatedWizardStep('save', form), true)
    })

    it('toFederatedViewSources maps drafts for API', () => {
        const sources = toFederatedViewSources([
            createFederatedWizardSourceDraft({
                connectionId: 'c1',
                connectionLabel: 'Shop',
                database: 'sales',
                alias: 'orders',
            }),
        ])
        assert.deepEqual(sources, [
            {
                alias: 'orders',
                connectionId: 'c1',
                connectionLabel: 'Shop',
                database: 'sales',
            },
        ])
    })

    it('buildInitialFederatedWizardSources seeds current scope', () => {
        const sources = buildInitialFederatedWizardSources(
            [{
                id: 'conn-1',
                label: 'MySQL',
                dbType: 'mysql',
                groupLabel: 'Relational',
                databases: [{id: 'db-1', label: 'shop'}],
            }],
            'conn-1',
            'shop',
        )
        assert.equal(sources.length, 1)
        assert.equal(sources[0].alias, 'primary')
        assert.equal(sources[0].database, 'shop')
    })
})
