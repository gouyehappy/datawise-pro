/**
 * Standard edition: omit paid UI implementation graphs from the host bundle.
 * - Migration / backup / governance / lineage / metadoc / dataops / datagen panels → Paywall stubs
 * - Host imports of features/ai/*.vue → empty stub (TS services stay resolvable for shared/host)
 */
import type {Plugin} from 'vite'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const AI_VUE_STUB = '\0datawise-standard-ai-vue-stub'
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(PLUGIN_DIR, '..')

/** Substrings matched against import source paths (prefer "*.vue" to avoid useXFoo composables). */
const PAID_UI_STUBS: Array<{match: string; stub: string}> = [
    {match: 'BackupCenterSettingsPanel', stub: 'src/features/pack/stubs/BackupSettingsStub.vue'},
    {match: 'TableMigrationTab', stub: 'src/features/pack/stubs/MigrationWorkbenchStub.vue'},
    {match: 'MigrationTasksPanel', stub: 'src/features/pack/stubs/MigrationTasksStub.vue'},
    {match: 'MigrationWizardSteps', stub: 'src/features/pack/stubs/MigrationWizardStepsStub.vue'},
    {match: 'SchemaCompareTab', stub: 'src/features/pack/stubs/GovernanceSchemaStub.vue'},
    {match: 'CrossEnvCompareTab', stub: 'src/features/pack/stubs/GovernanceCrossEnvStub.vue'},
    {match: 'MetadocTab', stub: 'src/features/pack/stubs/MetadocWorkbenchStub.vue'},
    {match: 'ViewModelLineageTab', stub: 'src/features/pack/stubs/LineageWorkbenchStub.vue'},
    {match: 'LineageGraphPanel', stub: 'src/features/pack/stubs/LineageWorkbenchStub.vue'},
    {match: 'ViewModelLineagePreviewPanel', stub: 'src/features/pack/stubs/LineageWorkbenchStub.vue'},
    {match: 'SqlMonitorPanel', stub: 'src/features/pack/stubs/DataopsMonitorStub.vue'},
    {match: 'ActiveSessionsPanel', stub: 'src/features/pack/stubs/DataopsMonitorStub.vue'},
    {match: 'LockWaitsPanel', stub: 'src/features/pack/stubs/DataopsMonitorStub.vue'},
    {match: 'FakeDataDialog.vue', stub: 'src/features/pack/stubs/DatagenFakeDataStub.vue'},
    {match: 'FederatedViewWizardDialog', stub: 'src/features/pack/stubs/PlatformAiDialogStub.vue'},
    {match: 'AnalysisCanvasRerunDialog', stub: 'src/features/pack/stubs/PlatformAiDialogStub.vue'},
]

function paidUiStub(source: string): string | null {
    // Avoid remapping our own *Stub.vue files (names often contain the original component id).
    if (source.includes('/pack/stubs/') || source.includes('\\pack\\stubs\\') || /Stub\.vue/.test(source)) {
        return null
    }
    for (const entry of PAID_UI_STUBS) {
        if (source.includes(entry.match)) {
            return resolve(PROJECT_ROOT, entry.stub)
        }
    }
    return null
}

function isPackStubImporter(importer: string | undefined): boolean {
    if (!importer) return false
    return importer.includes('/pack/stubs/') || importer.includes('\\pack\\stubs\\')
}

function isAiFeaturePath(source: string): boolean {
    return source.includes('features/ai') || source.includes('features\\ai')
}

function isVueSource(source: string): boolean {
    return source.endsWith('.vue') || (/features[/\\]ai[/\\][^?]*$/.test(source) && !source.includes('.'))
}

export function standardEditionAiStubPlugin(edition: 'standard' | 'full'): Plugin | null {
    if (edition !== 'standard') return null
    return {
        name: 'datawise-standard-edition-stubs',
        enforce: 'pre',
        resolveId(source, importer) {
            if (!isPackStubImporter(importer)) {
                const paid = paidUiStub(source)
                if (paid) return paid
            }

            // Only stub AI Vue / workbench entry points from the host graph.
            // Shared/host TS imports (analysis-step, sse consumer, types, …) must resolve normally.
            if (!isAiFeaturePath(source)) return null
            const fromAi =
                importer != null &&
                (importer.includes('/features/ai/') ||
                    importer.includes('\\features\\ai\\') ||
                    isPackStubImporter(importer))
            if (fromAi) return null
            if (source.includes('pack/stubs') || source.includes('AiWorkbenchStub')) {
                return null
            }
            if (source.includes('AiWorkbench') || (isVueSource(source) && source.includes('.vue'))) {
                return AI_VUE_STUB
            }
            return null
        },
        load(id) {
            if (id !== AI_VUE_STUB) return null
            return `
import {defineComponent, h} from 'vue'
export default defineComponent({
  name: 'DatawiseStandardAiVueStub',
  setup() {
    return () => h('div', {class: 'datawise-standard-ai-vue-stub'})
  },
})
`
        },
    }
}

/** Absolute stub path helper for tests. */
export function standardAiStubId(projectRoot: string): string {
    return resolve(projectRoot, 'src/features/pack/stubs/ai-module-stub.ts')
}
