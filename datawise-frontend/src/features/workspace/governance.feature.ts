import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const isStandard = import.meta.env.VITE_DATAWISE_EDITION === 'standard'

type TabEntry = {type: WorkspaceTabType; loader: LazyViewLoader}

const GOVERNANCE_TABS: TabEntry[] = [
    {
        type: 'schema-compare',
        loader: () =>
            isStandard
                ? import('@/features/pack/stubs/GovernanceSchemaStub.vue')
                : import('./components/tabs/SchemaCompareTab.vue'),
    },
    {type: 'schema-er', loader: () => import('./components/tabs/SchemaErTab.vue')},
    {type: 'schema-tables', loader: () => import('./components/tabs/SchemaTablesTab.vue')},
    {
        type: 'metadoc',
        loader: () =>
            isStandard
                ? import('@/features/pack/stubs/MetadocWorkbenchStub.vue')
                : import('./components/tabs/MetadocTab.vue'),
    },
    {
        type: 'cross-env-compare',
        loader: () =>
            isStandard
                ? import('@/features/pack/stubs/GovernanceCrossEnvStub.vue')
                : import('./components/tabs/CrossEnvCompareTab.vue'),
    },
    {
        type: 'table-migration',
        loader: () =>
            isStandard
                ? import('@/features/pack/stubs/MigrationWorkbenchStub.vue')
                : import('./components/tabs/TableMigrationTab.vue'),
    },
    {type: 'view_model', loader: () => import('./components/tabs/ViewModelDataTab.vue')},
    {type: 'view_model_editor', loader: () => import('./components/tabs/ViewModelEditorTab.vue')},
    {
        type: 'view_model_lineage',
        loader: () =>
            isStandard
                ? import('@/features/pack/stubs/LineageWorkbenchStub.vue')
                : import('./components/tabs/ViewModelLineageTab.vue'),
    },
]

/** Governance / schema / view-model tabs — Feature Contract A-15-FULL. */
export const governanceFeature = defineFeature({
    id: 'workspace-governance',
    contributes: {
        tabs: GOVERNANCE_TABS.map(({type, loader}) => ({type, loader})),
    },
})
