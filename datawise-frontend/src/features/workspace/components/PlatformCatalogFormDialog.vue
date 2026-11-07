<script setup lang="ts">
import {computed, nextTick, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {
    AppModal,
    CollapsibleSection,
    ConfirmDialog,
    DwInlineAlert,
    DwInput,
    FormField,
    ModalActions,
    SettingsSwitch,
} from '@/core/components'
import DwSelect from '@/core/components/DwSelect.vue'
import type {SelectOption} from '@/core/components/select.types'
import type {PlatformFeatureId} from '@/features/platform/types/platform.types'
import type {WorkspaceTab} from '@/core/types'
import {getTabParam} from '@/features/workspace/services/workspace-tab-params'
import {
    savePlatformCatalogItem,
    type PlatformCatalogFormPayload,
} from '@/features/platform/services/platform-catalog-mutations.service'
import {instanceSqlApi, platformApi} from '@/api'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import type {
    AnalysisCanvasSummary,
    DataQualitySharedTemplate,
} from '@/features/platform/types/platform.types'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useNotificationStore} from '@/features/layout/stores/notification-store'
import {useTeamStore} from '@/features/team/stores/team-store'
import {
    buildScheduledSqlPayloadJson,
    type ScheduledSqlSource,
} from '@/features/platform/services/scheduled-sql-payload.service'
import {
    applyOrchestrationHttpPreset,
    ORCHESTRATION_HTTP_PRESETS,
    type OrchestrationHttpPresetId,
} from '@/features/platform/services/orchestration-http-presets.service'
import {
    applyDataQualityRuleTemplate,
    DATA_QUALITY_RULE_TEMPLATE_CUSTOM_ID,
    DATA_QUALITY_RULE_TEMPLATES,
    findDataQualityRuleTemplate,
} from '@/features/platform/constants/data-quality-rule-templates'
import {
    applyDataQualityUserTemplate,
    createDataQualityUserTemplate,
    findDataQualityUserTemplate,
    readDataQualityUserTemplates,
    removeDataQualityUserTemplate,
    upsertDataQualityUserTemplate,
    writeDataQualityUserTemplates,
} from '@/features/platform/services/data-quality-user-templates.service'
import type {DataQualityUserTemplate} from '@/features/platform/types/data-quality-user-template.types'
import {canPersistLocalResource} from '@/features/auth/services/user-resource-policy'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    open: boolean
    feature: PlatformFeatureId
    tab: WorkspaceTab
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    saved: []
}>()

const {t} = useI18n()
const {
    open: confirmOpen,
    title: confirmTitle,
    message: confirmMessage,
    confirmLabel,
    confirmVariant,
    ask: askConfirm,
    onConfirm: onConfirmDialog,
    onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()
const explorer = useExplorerStore()
const notifications = useNotificationStore()
const teamStore = useTeamStore()
const saving = ref(false)
const error = ref('')
const firstFieldRef = ref<{ $el?: HTMLElement } | null>(null)
const sqlFileOptionsLoading = ref(false)
const sqlFileOptions = ref<SelectOption[]>([])
const sharedQueryOptionsLoading = ref(false)
const sharedQueryOptions = ref<SelectOption[]>([])

const semanticForm = reactive({
    id: '',
    name: '',
    expression: '',
    description: '',
    unit: '',
    owner: '',
    tags: '',
    upstreamMetrics: '',
    changeNote: '',
})
const canvasForm = reactive({title: '', description: '', promptTemplate: '', sql: ''})
const driftForm = reactive({
    name: '',
    targetConnectionId: '',
    targetDatabase: '',
    tablePattern: '%',
    enabled: true,
})
const taskForm = reactive({
    name: '',
    type: 'sql',
    cronExpression: '0 0 * * *',
    canvasId: '',
    sqlSource: 'inline' as ScheduledSqlSource,
    sql: '',
    sqlFile: '',
    teamId: '',
    queryId: '',
    payloadJson: '{}',
    enabled: true,
    digest: false,
    digestMaxRows: '20',
    dqAssertion: 'empty_result',
    dqExpected: '0',
    dqColumn: '',
    dqBlocking: false,
    httpUrl: '',
    httpMethod: 'POST',
    httpBodyJson: '{}',
    httpHeadersJson: '{}',
    httpTimeoutMs: '10000',
    httpStatusUrlTemplate: '',
})
const canvasOptions = ref<AnalysisCanvasSummary[]>([])
const canvasOptionsLoading = ref(false)
const dqTemplateId = ref(DATA_QUALITY_RULE_TEMPLATE_CUSTOM_ID)
const dqUserTemplates = ref<DataQualityUserTemplate[]>([])
const dqSharedTemplates = ref<DataQualitySharedTemplate[]>([])
const dqSharedTemplatesLoading = ref(false)
const templateFeedback = ref('')
const templateBusy = ref(false)

function reloadDqUserTemplates() {
    dqUserTemplates.value = readDataQualityUserTemplates()
}

async function reloadDqSharedTemplates() {
    dqSharedTemplatesLoading.value = true
    try {
        dqSharedTemplates.value = await platformApi.listDataQualityTemplates()
    } catch {
        dqSharedTemplates.value = []
    } finally {
        dqSharedTemplatesLoading.value = false
    }
}

const canSaveDqUserTemplate = computed(() =>
    canPersistLocalResource(UserResource.DataQualityTemplates),
)

const selectedDqUserTemplate = computed(() =>
    findDataQualityUserTemplate(dqTemplateId.value, dqUserTemplates.value),
)

const selectedDqSharedTemplate = computed(() =>
    dqSharedTemplates.value.find((item) => item.id === dqTemplateId.value) ?? null,
)

const dialogTitle = computed(() => {
    switch (props.feature) {
        case 'semantic_metrics':
            return t('platform.metrics.formTitle')
        case 'analysis_canvas':
            return t('platform.canvas.formTitle')
        case 'schema_drift':
            return t('platform.drift.formTitle')
        case 'scheduled_tasks':
            return t('platform.tasks.formTitle')
        case 'data_quality':
            return t('platform.dq.formTitle')
        default:
            return t('workspace.platformCatalog.add')
    }
})

const dialogSubtitle = computed(() =>
    t(`workspace.platformCatalog.form.subtitle.${props.feature}`),
)

const dialogWidth = computed(() =>
    props.feature === 'analysis_canvas' ? '600px' : '560px',
)

const showScopeBanner = computed(() =>
    props.feature === 'semantic_metrics'
    || props.feature === 'schema_drift'
    || props.feature === 'data_quality',
)

const scopeConnectionLabel = computed(() => {
    const connectionId = props.tab.connectionId
    if (!connectionId) return '—'
    return explorer.findNode(connectionId)?.label ?? connectionId
})

const scopeDatabase = computed(() => props.tab.database?.trim() || '—')

const taskCanvasSelectOptions = computed<SelectOption[]>(() =>
    canvasOptions.value.map((item) => ({
        value: item.id,
        label: item.title || item.id,
    })),
)

const showTaskPayloadEditor = computed(() =>
    props.feature === 'scheduled_tasks'
    && taskForm.type !== 'canvas'
    && taskForm.type !== 'data_quality'
    && taskForm.type !== 'http_trigger',
)

const showSqlSourceFields = computed(() =>
    props.feature === 'scheduled_tasks' && taskForm.type === 'sql',
)

const showDataQualityFields = computed(() =>
    (props.feature === 'scheduled_tasks' && taskForm.type === 'data_quality')
    || props.feature === 'data_quality',
)

const isDataQualityCatalog = computed(() => props.feature === 'data_quality')

const showHttpTriggerFields = computed(() =>
    props.feature === 'scheduled_tasks' && taskForm.type === 'http_trigger',
)

const taskTypeOptions = computed<SelectOption[]>(() => [
    {value: 'sql', label: t('workspace.platformCatalog.form.taskType.sql')},
    {value: 'canvas', label: t('workspace.platformCatalog.form.taskType.canvas')},
    {value: 'schema_drift', label: t('workspace.platformCatalog.form.taskType.schema_drift')},
    {value: 'data_quality', label: t('workspace.platformCatalog.form.taskType.data_quality')},
    {value: 'http_trigger', label: t('workspace.platformCatalog.form.taskType.http_trigger')},
])

const httpMethodOptions = computed<SelectOption[]>(() => [
    {value: 'POST', label: 'POST'},
    {value: 'PUT', label: 'PUT'},
    {value: 'PATCH', label: 'PATCH'},
    {value: 'GET', label: 'GET'},
])

const httpPresetId = ref<OrchestrationHttpPresetId>('custom')

const httpPresetOptions = computed<SelectOption[]>(() =>
    ORCHESTRATION_HTTP_PRESETS.map((preset) => ({
        value: preset.id,
        label: t(`workspace.platformCatalog.form.httpPreset.${preset.labelKey}`),
    })),
)

watch(httpPresetId, (id, previous) => {
    if (!id || id === previous || id === 'custom') return
    const fields = applyOrchestrationHttpPreset(id)
    taskForm.httpUrl = fields.httpUrl
    taskForm.httpMethod = fields.httpMethod
    taskForm.httpBodyJson = fields.httpBodyJson
    taskForm.httpHeadersJson = fields.httpHeadersJson
    taskForm.httpTimeoutMs = fields.httpTimeoutMs
    taskForm.httpStatusUrlTemplate = fields.httpStatusUrlTemplate
})

const dqAssertionOptions = computed<SelectOption[]>(() => [
    {value: 'empty_result', label: t('workspace.platformCatalog.form.dqAssertion.empty_result')},
    {value: 'row_count_eq', label: t('workspace.platformCatalog.form.dqAssertion.row_count_eq')},
    {value: 'row_count_lte', label: t('workspace.platformCatalog.form.dqAssertion.row_count_lte')},
    {value: 'scalar_eq', label: t('workspace.platformCatalog.form.dqAssertion.scalar_eq')},
    {value: 'scalar_lte', label: t('workspace.platformCatalog.form.dqAssertion.scalar_lte')},
])

const dqTemplateOptions = computed<SelectOption[]>(() => [
    {
        value: DATA_QUALITY_RULE_TEMPLATE_CUSTOM_ID,
        label: t('workspace.platformCatalog.form.dqTemplate.custom'),
    },
    ...DATA_QUALITY_RULE_TEMPLATES.map((item) => ({
        value: item.id,
        label: t(`workspace.platformCatalog.form.dqTemplate.items.${item.nameKey}`),
    })),
    ...dqSharedTemplates.value.map((item) => ({
        value: item.id,
        label: t('workspace.platformCatalog.form.dqTemplate.sharedPrefix', {name: item.name}),
    })),
    ...dqUserTemplates.value.map((item) => ({
        value: item.id,
        label: t('workspace.platformCatalog.form.dqTemplate.userPrefix', {name: item.name}),
    })),
])

const dqTemplateHint = computed(() => {
    const shared = selectedDqSharedTemplate.value
    if (shared) {
        return shared.description || t('workspace.platformCatalog.form.hint.dqSharedTemplate')
    }
    const user = selectedDqUserTemplate.value
    if (user) {
        return user.description || t('workspace.platformCatalog.form.hint.dqUserTemplate')
    }
    const tpl = findDataQualityRuleTemplate(dqTemplateId.value)
    if (!tpl) return t('workspace.platformCatalog.form.hint.dqTemplate')
    return t(`workspace.platformCatalog.form.dqTemplate.items.${tpl.descriptionKey}`)
})

function applySharedOrUserFields(fields: {
    name: string
    sql: string
    dqAssertion: string
    dqExpected: string
    dqColumn: string
    dqBlocking: boolean
    cronExpression?: string | null
}) {
    taskForm.name = fields.name
    taskForm.sql = fields.sql
    taskForm.dqAssertion = fields.dqAssertion
    taskForm.dqExpected = fields.dqExpected
    taskForm.dqColumn = fields.dqColumn
    taskForm.dqBlocking = fields.dqBlocking
    if (fields.cronExpression != null && fields.cronExpression !== '') {
        taskForm.cronExpression = fields.cronExpression
    } else if (isDataQualityCatalog.value) {
        taskForm.cronExpression = ''
    }
}

function applySelectedDqTemplate(id: string) {
    templateFeedback.value = ''
    const builtin = findDataQualityRuleTemplate(id)
    if (builtin) {
        const fields = applyDataQualityRuleTemplate(builtin, (nameKey) =>
            t(`workspace.platformCatalog.form.dqTemplate.items.${nameKey}`),
        )
        taskForm.name = fields.name
        taskForm.sql = fields.sql
        taskForm.dqAssertion = fields.dqAssertion
        taskForm.dqExpected = fields.dqExpected
        taskForm.dqColumn = fields.dqColumn
        taskForm.dqBlocking = fields.dqBlocking
        if (fields.cronExpression != null) {
            taskForm.cronExpression = fields.cronExpression
        }
        return
    }
    const shared = dqSharedTemplates.value.find((item) => item.id === id)
    if (shared) {
        applySharedOrUserFields({
            name: shared.name,
            sql: shared.sql,
            dqAssertion: shared.assertion,
            dqExpected: shared.expected ?? '0',
            dqColumn: shared.column ?? '',
            dqBlocking: shared.blocking,
            cronExpression: shared.cronExpression,
        })
        return
    }
    const user = findDataQualityUserTemplate(id, dqUserTemplates.value)
    if (!user) return
    applySharedOrUserFields(applyDataQualityUserTemplate(user))
}

function saveCurrentAsDqUserTemplate() {
    templateFeedback.value = ''
    error.value = ''
    if (!canSaveDqUserTemplate.value) {
        error.value = t('workspace.platformCatalog.form.dqTemplate.saveDenied')
        return
    }
    const created = createDataQualityUserTemplate({
        name: taskForm.name,
        description: '',
        sql: taskForm.sql,
        assertion: taskForm.dqAssertion as DataQualityUserTemplate['assertion'],
        expected: taskForm.dqExpected,
        column: taskForm.dqColumn,
        blocking: taskForm.dqBlocking,
        cronExpression: taskForm.cronExpression,
    })
    if (!created) {
        error.value = t('workspace.platformCatalog.form.dqTemplate.saveNeedNameSql')
        return
    }
    const next = upsertDataQualityUserTemplate(dqUserTemplates.value, created)
    if (!writeDataQualityUserTemplates(next)) {
        error.value = t('workspace.platformCatalog.form.dqTemplate.saveFailed')
        return
    }
    dqUserTemplates.value = next
    dqTemplateId.value = created.id
    templateFeedback.value = t('workspace.platformCatalog.form.dqTemplate.saved', {name: created.name})
}

async function saveCurrentAsDqSharedTemplate() {
    templateFeedback.value = ''
    error.value = ''
    if (!canSaveDqUserTemplate.value) {
        error.value = t('workspace.platformCatalog.form.dqTemplate.saveDenied')
        return
    }
    const name = taskForm.name.trim()
    const sql = taskForm.sql.trim()
    if (!name || !sql) {
        error.value = t('workspace.platformCatalog.form.dqTemplate.saveNeedNameSql')
        return
    }
    templateBusy.value = true
    try {
        const created = await platformApi.saveDataQualityTemplate({
            name,
            description: '',
            sql,
            assertion: taskForm.dqAssertion,
            expected: taskForm.dqExpected,
            column: taskForm.dqColumn || null,
            blocking: taskForm.dqBlocking,
            cronExpression: taskForm.cronExpression.trim() || null,
        })
        await reloadDqSharedTemplates()
        dqTemplateId.value = created.id
        templateFeedback.value = t('workspace.platformCatalog.form.dqTemplate.sharedSaved', {
            name: created.name,
        })
    } catch (e) {
        error.value = resolveCaughtApiErrorMessage(
            e,
            t,
            'workspace.platformCatalog.form.dqTemplate.sharedSaveFailed',
        )
    } finally {
        templateBusy.value = false
    }
}

function deleteSelectedDqUserTemplate() {
    templateFeedback.value = ''
    error.value = ''
    const current = selectedDqUserTemplate.value
    if (!current) return
    const next = removeDataQualityUserTemplate(dqUserTemplates.value, current.id)
    if (!writeDataQualityUserTemplates(next)) {
        error.value = t('workspace.platformCatalog.form.dqTemplate.saveFailed')
        return
    }
    dqUserTemplates.value = next
    dqTemplateId.value = DATA_QUALITY_RULE_TEMPLATE_CUSTOM_ID
    templateFeedback.value = t('workspace.platformCatalog.form.dqTemplate.deleted', {name: current.name})
}

async function deleteSelectedDqSharedTemplate() {
    templateFeedback.value = ''
    error.value = ''
    const current = selectedDqSharedTemplate.value
    if (!current) return
    const confirmed = await askConfirm({
        title: t('workspace.platformCatalog.form.dqTemplate.deleteShared'),
        message: t('workspace.platformCatalog.form.dqTemplate.deleteSharedConfirm', {name: current.name}),
        confirmLabel: t('workspace.platformCatalog.form.dqTemplate.deleteShared'),
    })
    if (!confirmed) return
    templateBusy.value = true
    try {
        await platformApi.deleteDataQualityTemplate(current.id)
        await reloadDqSharedTemplates()
        dqTemplateId.value = DATA_QUALITY_RULE_TEMPLATE_CUSTOM_ID
        templateFeedback.value = t('workspace.platformCatalog.form.dqTemplate.sharedDeleted', {
            name: current.name,
        })
    } catch (e) {
        error.value = resolveCaughtApiErrorMessage(
            e,
            t,
            'workspace.platformCatalog.form.dqTemplate.sharedSaveFailed',
        )
    } finally {
        templateBusy.value = false
    }
}

const sqlSourceOptions = computed<SelectOption[]>(() => [
    {value: 'inline', label: t('workspace.platformCatalog.form.sqlSource.inline')},
    {value: 'workspace_file', label: t('workspace.platformCatalog.form.sqlSource.workspace_file')},
    {value: 'query_library', label: t('workspace.platformCatalog.form.sqlSource.query_library')},
])

const teamSelectOptions = computed<SelectOption[]>(() =>
    teamStore.teams.map((team) => ({
        value: team.id,
        label: team.name || team.id,
    })),
)

const selectedSharedQueryHint = computed(() => {
    const query = sharedQueryOptions.value.find((item) => item.value === taskForm.queryId)
    return query?.label ?? ''
})

async function ensureTeamsLoaded() {
    if (!teamStore.ready || !teamStore.teams.length) {
        try {
            await teamStore.load()
        } catch {
            // leave empty; UI shows empty hint
        }
    }
}

async function loadSqlFileOptions() {
    const connectionId = props.tab.connectionId?.trim()
    const database = props.tab.database?.trim()
    sqlFileOptions.value = []
    if (!connectionId || !database) return
    sqlFileOptionsLoading.value = true
    try {
        const files = await instanceSqlApi.listScripts({
            connectionId,
            instanceName: database,
        })
        sqlFileOptions.value = files.map((file) => ({
            value: file.fileName,
            label: file.fileName,
        }))
        if (taskForm.sqlFile && !sqlFileOptions.value.some((item) => item.value === taskForm.sqlFile)) {
            sqlFileOptions.value = [
                {value: taskForm.sqlFile, label: taskForm.sqlFile},
                ...sqlFileOptions.value,
            ]
        }
    } catch {
        sqlFileOptions.value = taskForm.sqlFile
            ? [{value: taskForm.sqlFile, label: taskForm.sqlFile}]
            : []
    } finally {
        sqlFileOptionsLoading.value = false
    }
}

async function loadSharedQueryOptions(teamId: string) {
    sharedQueryOptions.value = []
    const id = teamId.trim()
    if (!id) return
    sharedQueryOptionsLoading.value = true
    try {
        const list = await teamStore.fetchSharedQueries(id)
        sharedQueryOptions.value = list.map((item) => ({
            value: item.id,
            label: item.title?.trim() || item.id,
        }))
        if (taskForm.queryId && !sharedQueryOptions.value.some((item) => item.value === taskForm.queryId)) {
            sharedQueryOptions.value = [
                {value: taskForm.queryId, label: taskForm.queryId},
                ...sharedQueryOptions.value,
            ]
        }
    } catch {
        sharedQueryOptions.value = taskForm.queryId
            ? [{value: taskForm.queryId, label: taskForm.queryId}]
            : []
    } finally {
        sharedQueryOptionsLoading.value = false
    }
}

async function refreshSqlSourceOptions() {
    if (taskForm.sqlSource === 'workspace_file') {
        await loadSqlFileOptions()
        return
    }
    if (taskForm.sqlSource === 'query_library') {
        await ensureTeamsLoaded()
        if (!taskForm.teamId && teamStore.teams[0]?.id) {
            taskForm.teamId = teamStore.teams[0].id
        }
        await loadSharedQueryOptions(taskForm.teamId)
    }
}

const canSave = computed(() => {
    switch (props.feature) {
        case 'semantic_metrics':
            return Boolean(semanticForm.name.trim())
        case 'analysis_canvas':
            return Boolean(canvasForm.title.trim())
        case 'schema_drift':
            return Boolean(
                driftForm.name.trim()
                && driftForm.targetConnectionId.trim()
                && driftForm.targetDatabase.trim()
                && props.tab.connectionId
                && props.tab.database,
            )
        case 'scheduled_tasks':
            if (!taskForm.name.trim() || !taskForm.type.trim()) return false
            if (taskForm.type === 'canvas') return Boolean(taskForm.canvasId.trim())
            if (taskForm.type === 'sql') {
                if (taskForm.sqlSource === 'workspace_file') return Boolean(taskForm.sqlFile.trim())
                if (taskForm.sqlSource === 'query_library') {
                    return Boolean(taskForm.teamId.trim() && taskForm.queryId.trim())
                }
                return Boolean(taskForm.sql.trim() || taskForm.payloadJson.trim())
            }
            if (taskForm.type === 'data_quality') {
                return Boolean(taskForm.sql.trim() && taskForm.dqAssertion.trim())
            }
            if (taskForm.type === 'http_trigger') {
                return Boolean(taskForm.httpUrl.trim())
            }
            return true
        case 'data_quality':
            return Boolean(
                taskForm.name.trim()
                && taskForm.sql.trim()
                && taskForm.dqAssertion.trim()
                && props.tab.connectionId
                && props.tab.database,
            )
        default:
            return false
    }
})

function resetForms() {
    semanticForm.id = ''
    semanticForm.name = ''
    semanticForm.expression = ''
    semanticForm.description = ''
    semanticForm.unit = ''
    semanticForm.owner = ''
    semanticForm.tags = ''
    semanticForm.upstreamMetrics = ''
    semanticForm.changeNote = ''
    canvasForm.title = ''
    canvasForm.description = ''
    canvasForm.promptTemplate = ''
    canvasForm.sql = ''
    driftForm.name = ''
    driftForm.targetConnectionId = ''
    driftForm.targetDatabase = ''
    driftForm.tablePattern = '%'
    driftForm.enabled = true
    taskForm.name = ''
    taskForm.type = 'sql'
    taskForm.cronExpression = '0 0 * * *'
    taskForm.canvasId = ''
    taskForm.sqlSource = 'inline'
    taskForm.sql = ''
    taskForm.sqlFile = ''
    taskForm.teamId = ''
    taskForm.queryId = ''
    taskForm.payloadJson = '{}'
    taskForm.enabled = true
    taskForm.digest = false
    taskForm.digestMaxRows = '20'
    taskForm.dqAssertion = 'empty_result'
    taskForm.dqExpected = '0'
    taskForm.dqColumn = ''
    taskForm.dqBlocking = false
    dqTemplateId.value = DATA_QUALITY_RULE_TEMPLATE_CUSTOM_ID
    taskForm.httpUrl = ''
    taskForm.httpMethod = 'POST'
    taskForm.httpBodyJson = '{}'
    taskForm.httpHeadersJson = '{}'
    taskForm.httpTimeoutMs = '10000'
    taskForm.httpStatusUrlTemplate = ''
    httpPresetId.value = 'custom'
    canvasOptions.value = []
    sqlFileOptions.value = []
    sharedQueryOptions.value = []
    dqSharedTemplates.value = []
    error.value = ''
    templateFeedback.value = ''
}

function applyScheduleDraft() {
    const draft = getTabParam(props.tab, 'platformScheduleDraft')
    if (!draft || props.feature !== 'scheduled_tasks') return
    if (draft.name?.trim()) taskForm.name = draft.name.trim()
    if (draft.cronExpression?.trim()) taskForm.cronExpression = draft.cronExpression.trim()
    if (draft.enabled != null) taskForm.enabled = draft.enabled
    taskForm.type = 'sql'
    taskForm.sqlSource = draft.source ?? 'workspace_file'
    if (draft.sql?.trim()) taskForm.sql = draft.sql.trim()
    if (draft.sqlFile?.trim()) taskForm.sqlFile = draft.sqlFile.trim()
    if (draft.teamId?.trim()) taskForm.teamId = draft.teamId.trim()
    if (draft.queryId?.trim()) taskForm.queryId = draft.queryId.trim()
    try {
        taskForm.payloadJson = buildScheduledSqlPayloadJson({
            source: taskForm.sqlSource,
            connectionId: props.tab.connectionId ?? '',
            database: props.tab.database ?? '',
            sql: taskForm.sql,
            sqlFile: taskForm.sqlFile,
            teamId: taskForm.teamId,
            queryId: taskForm.queryId,
            digest: taskForm.digest,
            digestMaxRows: parseDigestMaxRows(),
        })
    } catch {
        // keep defaults until user fills required fields
    }
}

watch(
    () => props.open,
    async (isOpen) => {
        if (!isOpen) return
        resetForms()
        reloadDqUserTemplates()
        if (props.feature === 'data_quality' || props.feature === 'scheduled_tasks') {
            void reloadDqSharedTemplates()
        }
        if (props.feature === 'data_quality') {
            taskForm.type = 'data_quality'
            taskForm.cronExpression = ''
        }
        if (props.feature === 'scheduled_tasks') {
            applyScheduleDraft()
            canvasOptionsLoading.value = true
            try {
                canvasOptions.value = await platformApi.listAnalysisCanvas()
            } catch {
                canvasOptions.value = []
            } finally {
                canvasOptionsLoading.value = false
            }
            await refreshSqlSourceOptions()
        }
        await nextTick()
        const el = firstFieldRef.value?.$el
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus()
    },
)

watch(
    () => taskForm.sqlSource,
    async (source, previous) => {
        if (!props.open || props.feature !== 'scheduled_tasks') return
        if (source === previous) return
        error.value = ''
        await refreshSqlSourceOptions()
    },
)

watch(
    () => taskForm.teamId,
    async (teamId, previous) => {
        if (!props.open || props.feature !== 'scheduled_tasks') return
        if (taskForm.sqlSource !== 'query_library') return
        if (teamId === previous) return
        if (previous) taskForm.queryId = ''
        await loadSharedQueryOptions(teamId)
    },
)

function close() {
    emit('update:open', false)
}

function parseDigestMaxRows(): number | undefined {
    if (!taskForm.digest || (taskForm.type !== 'sql' && taskForm.type !== 'canvas')) return undefined
    const parsed = Number.parseInt(taskForm.digestMaxRows.trim() || '20', 10)
    if (!Number.isFinite(parsed)) return 20
    return Math.max(1, Math.min(50, parsed))
}

function buildPayload(): PlatformCatalogFormPayload | null {
    switch (props.feature) {
        case 'semantic_metrics':
            return {...semanticForm, feature: 'semantic_metrics'}
        case 'analysis_canvas':
            return {...canvasForm, feature: 'analysis_canvas'}
        case 'schema_drift':
            return {...driftForm, feature: 'schema_drift'}
        case 'scheduled_tasks': {
            let payloadJson = taskForm.payloadJson.trim() || undefined
            if (taskForm.type === 'canvas') {
                const digestMaxRows = parseDigestMaxRows()
                payloadJson = JSON.stringify({
                    canvasId: taskForm.canvasId.trim(),
                    ...(taskForm.digest ? {digest: true} : {}),
                    ...(digestMaxRows != null ? {digestMaxRows} : {}),
                })
            } else if (taskForm.type === 'sql') {
                try {
                    payloadJson = buildScheduledSqlPayloadJson({
                        source: taskForm.sqlSource,
                        connectionId: props.tab.connectionId ?? '',
                        database: props.tab.database ?? '',
                        sql: taskForm.sql,
                        sqlFile: taskForm.sqlFile,
                        teamId: taskForm.teamId,
                        queryId: taskForm.queryId,
                        digest: taskForm.digest,
                        digestMaxRows: parseDigestMaxRows(),
                    })
                } catch (e) {
                    error.value = resolveCaughtApiErrorMessage(
                        e,
                        t,
                        'workspace.platformCatalog.form.validation.required',
                    )
                    return null
                }
            } else if (taskForm.type === 'data_quality') {
                payloadJson = JSON.stringify({
                    connectionId: props.tab.connectionId ?? '',
                    database: props.tab.database ?? '',
                    sql: taskForm.sql.trim(),
                    assertion: taskForm.dqAssertion.trim() || 'empty_result',
                    expected: taskForm.dqExpected.trim() || '0',
                    ...(taskForm.dqColumn.trim() ? {column: taskForm.dqColumn.trim()} : {}),
                    ...(taskForm.dqBlocking ? {blocking: true} : {}),
                })
            } else if (taskForm.type === 'http_trigger') {
                let bodyJson: unknown = {}
                let headers: Record<string, string> = {}
                try {
                    bodyJson = taskForm.httpBodyJson.trim()
                        ? JSON.parse(taskForm.httpBodyJson.trim())
                        : {}
                } catch {
                    error.value = t('workspace.platformCatalog.form.validation.httpBodyJson')
                    return null
                }
                try {
                    const parsed = taskForm.httpHeadersJson.trim()
                        ? JSON.parse(taskForm.httpHeadersJson.trim())
                        : {}
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        headers = parsed as Record<string, string>
                    } else {
                        error.value = t('workspace.platformCatalog.form.validation.httpHeadersJson')
                        return null
                    }
                } catch {
                    error.value = t('workspace.platformCatalog.form.validation.httpHeadersJson')
                    return null
                }
                const timeoutMs = Number.parseInt(taskForm.httpTimeoutMs.trim() || '10000', 10)
                payloadJson = JSON.stringify({
                    url: taskForm.httpUrl.trim(),
                    method: taskForm.httpMethod.trim() || 'POST',
                    headers,
                    bodyJson,
                    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 10000,
                })
            } else if (taskForm.digest && payloadJson) {
                try {
                    const parsed = JSON.parse(payloadJson) as Record<string, unknown>
                    parsed.digest = true
                    payloadJson = JSON.stringify(parsed)
                } catch {
                    // keep raw payloadJson
                }
            }
            return {
                ...taskForm,
                feature: 'scheduled_tasks',
                payloadJson: payloadJson ?? '{}',
            }
        }
        case 'data_quality': {
            if (!taskForm.sql.trim()) {
                error.value = t('workspace.platformCatalog.form.validation.required')
                return null
            }
            const payloadJson = JSON.stringify({
                connectionId: props.tab.connectionId ?? '',
                database: props.tab.database ?? '',
                sql: taskForm.sql.trim(),
                assertion: taskForm.dqAssertion.trim() || 'empty_result',
                expected: taskForm.dqExpected.trim() || '0',
                ...(taskForm.dqColumn.trim() ? {column: taskForm.dqColumn.trim()} : {}),
                ...(taskForm.dqBlocking ? {blocking: true} : {}),
            })
            return {
                feature: 'data_quality' as const,
                name: taskForm.name,
                type: 'data_quality',
                cronExpression: taskForm.cronExpression,
                payloadJson,
                enabled: taskForm.enabled,
            }
        }
        default:
            return null
    }
}

async function submit() {
    if (!canSave.value) {
        error.value = t('workspace.platformCatalog.form.validation.required')
        return
    }
    const payload = buildPayload()
    if (!payload) return
    saving.value = true
    error.value = ''
    try {
        const result = await savePlatformCatalogItem(payload, {
            connectionId: props.tab.connectionId,
            database: props.tab.database,
        })
        if (payload.feature === 'semantic_metrics' && result.definitionChanged && result.metricName) {
            await notifications.push({
                category: 'workspace',
                titleKey: 'metricDefinitionChanged',
                bodyKey: 'metricDefinitionChanged',
                params: {name: result.metricName},
            })
        }
        emit('saved')
        close()
    } catch (err) {
        error.value = resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed')
    } finally {
        saving.value = false
    }
}
</script>

<template>
  <AppModal
      :open="open"
      :title="dialogTitle"
      :subtitle="dialogSubtitle"
      :width="dialogWidth"
      @close="close"
  >
    <div v-if="showScopeBanner" class="modal-summary-box">
      <div class="modal-summary-row">
        <span class="modal-summary-row__label">{{ t('workspace.platformCatalog.form.scope.connection') }}</span>
        <span class="modal-summary-row__value">{{ scopeConnectionLabel }}</span>
      </div>
      <div class="modal-summary-row">
        <span class="modal-summary-row__label">
          {{ feature === 'schema_drift'
              ? t('workspace.platformCatalog.form.scope.source')
              : t('workspace.platformCatalog.form.scope.database') }}
        </span>
        <span class="modal-summary-row__value">{{ scopeDatabase }}</span>
      </div>
    </div>

    <form class="modal-form" @submit.prevent="submit">
      <template v-if="feature === 'semantic_metrics'">
        <fieldset class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.basic') }}</legend>
          <div class="modal-form-grid">
            <FormField :label="t('platform.common.name')">
              <template #default="{ id }">
                <DwInput
                    :id="id"
                    ref="firstFieldRef"
                    v-model="semanticForm.name"
                    type="text"
                    :placeholder="t('workspace.platformCatalog.form.placeholder.name')"
                />
              </template>
            </FormField>
            <FormField :label="t('platform.metrics.unit')">
              <template #default="{ id }">
                <DwInput :id="id" v-model="semanticForm.unit" type="text" />
              </template>
            </FormField>
            <FormField :label="t('platform.metrics.owner')">
              <template #default="{ id }">
                <DwInput
                    :id="id"
                    v-model="semanticForm.owner"
                    type="text"
                    :placeholder="t('workspace.platformCatalog.form.hint.owner')"
                />
              </template>
            </FormField>
            <FormField :label="t('platform.metrics.tags')">
              <template #default="{ id }">
                <DwInput
                    :id="id"
                    v-model="semanticForm.tags"
                    type="text"
                    :placeholder="t('workspace.platformCatalog.form.hint.tags')"
                />
              </template>
            </FormField>
          </div>
        </fieldset>

        <fieldset class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.definition') }}</legend>
          <FormField :label="t('platform.metrics.expression')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="semanticForm.expression"
                  :rows="3"
                  :spellcheck="false"
                  :placeholder="t('workspace.platformCatalog.form.hint.expression')"
                  variant="mono"
                />
            </template>
          </FormField>
          <FormField :label="t('platform.metrics.upstreamMetrics')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="semanticForm.upstreamMetrics"
                  type="text"
                  :placeholder="t('workspace.platformCatalog.form.hint.upstreamMetrics')"
                />
            </template>
          </FormField>
          <FormField :label="t('platform.metrics.changeNote')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="semanticForm.changeNote"
                  type="text"
                  :placeholder="t('workspace.platformCatalog.form.hint.changeNote')"
                />
            </template>
          </FormField>
          <FormField :label="t('platform.common.description')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="semanticForm.description"
                  :rows="2"
                  :placeholder="t('workspace.platformCatalog.form.placeholder.description')"
/>
            </template>
          </FormField>
        </fieldset>
      </template>

      <template v-else-if="feature === 'analysis_canvas'">
        <fieldset class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.basic') }}</legend>
          <FormField :label="t('platform.common.title')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  ref="firstFieldRef"
                  v-model="canvasForm.title"
                  type="text"
                  :placeholder="t('workspace.platformCatalog.form.placeholder.title')"
                />
            </template>
          </FormField>
          <FormField :label="t('platform.common.description')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="canvasForm.description"
                  :rows="2"
                  :placeholder="t('workspace.platformCatalog.form.placeholder.description')"
/>
            </template>
          </FormField>
        </fieldset>

        <fieldset class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.definition') }}</legend>
          <FormField :label="t('platform.canvas.promptTemplate')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="canvasForm.promptTemplate"
                  :rows="3"
                  :placeholder="t('workspace.platformCatalog.form.hint.promptTemplate')"
/>
            </template>
          </FormField>
          <FormField :label="t('platform.common.sql')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="canvasForm.sql"
                  :rows="7"
                  :spellcheck="false"
                  variant="mono"
                />
            </template>
          </FormField>
        </fieldset>
      </template>

      <template v-else-if="feature === 'schema_drift'">
        <fieldset class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.basic') }}</legend>
          <div class="modal-form-grid">
            <FormField :label="t('platform.common.name')">
              <template #default="{ id }">
                <DwInput
                    :id="id"
                    ref="firstFieldRef"
                    v-model="driftForm.name"
                    type="text"
                    :placeholder="t('workspace.platformCatalog.form.placeholder.name')"
                />
              </template>
            </FormField>
            <FormField :label="t('platform.drift.tablePattern')">
              <template #default="{ id }">
                <DwInput
                    :id="id"
                    v-model="driftForm.tablePattern"
                    type="text"
                    :spellcheck="false"
                />
              </template>
            </FormField>
          </div>
          <p class="modal-hint">{{ t('workspace.platformCatalog.form.hint.tablePattern') }}</p>
        </fieldset>

        <fieldset class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.target') }}</legend>
          <div class="modal-form-grid">
            <FormField :label="t('platform.drift.targetConnectionId')">
              <template #default="{ id }">
                <DwInput :id="id" v-model="driftForm.targetConnectionId" type="text" />
              </template>
            </FormField>
            <FormField :label="t('platform.drift.targetDatabase')">
              <template #default="{ id }">
                <DwInput :id="id" v-model="driftForm.targetDatabase" type="text" />
              </template>
            </FormField>
          </div>
        </fieldset>

        <SettingsSwitch v-model="driftForm.enabled" :label="t('platform.common.enabled')"/>
      </template>

      <template v-else-if="feature === 'scheduled_tasks' || feature === 'data_quality'">
        <fieldset class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.basic') }}</legend>
          <FormField :label="t('platform.common.name')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  ref="firstFieldRef"
                  v-model="taskForm.name"
                  type="text"
                  :placeholder="t('workspace.platformCatalog.form.placeholder.name')"
                />
            </template>
          </FormField>
        </fieldset>

        <fieldset class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.schedule') }}</legend>
          <div class="modal-form-grid">
            <label v-if="!isDataQualityCatalog" class="modal-field">
              <span>{{ t('platform.tasks.type') }}</span>
              <DwSelect v-model="taskForm.type" size="sm" :options="taskTypeOptions"/>
            </label>
            <FormField :label="t('platform.tasks.cronExpression')">
              <template #default="{ id }">
                <DwInput
                    :id="id"
                    v-model="taskForm.cronExpression"
                    class="modal-input--mono"
                    type="text"
                    :spellcheck="false"
                    :placeholder="isDataQualityCatalog
                      ? t('workspace.platformCatalog.form.hint.dqCron')
                      : t('workspace.platformCatalog.form.hint.cron')"
                />
              </template>
            </FormField>
          </div>
          <p class="modal-hint">
            {{ isDataQualityCatalog
              ? t('workspace.platformCatalog.form.hint.dqCron')
              : t('workspace.platformCatalog.form.hint.cron') }}
          </p>
        </fieldset>

        <SettingsSwitch v-model="taskForm.enabled" :label="t('platform.common.enabled')"/>
        <SettingsSwitch
            v-if="taskForm.type === 'sql' || taskForm.type === 'canvas'"
            v-model="taskForm.digest"
            :label="t('platform.tasks.digest')"
        />
        <FormField
            v-if="(taskForm.type === 'sql' || taskForm.type === 'canvas') && taskForm.digest"
            :label="t('platform.tasks.digestMaxRows')"
        >
          <template #default="{ id }">
            <DwInput
                :id="id"
                v-model="taskForm.digestMaxRows"
                type="number"
                    :min="1"
                    :max="50"
                    :step="1"
                />
          </template>
        </FormField>
        <p v-if="taskForm.type === 'canvas' && taskForm.digest" class="modal-hint">
          {{ t('platform.tasks.digestMaxRowsCanvasHint') }}
        </p>
        <p v-if="taskForm.type === 'sql' || taskForm.type === 'canvas'" class="modal-hint">
          {{ t('platform.tasks.digestHint') }}
        </p>

        <fieldset v-if="taskForm.type === 'canvas'" class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.target') }}</legend>
          <label class="modal-field">
            <span>{{ t('platform.tasks.canvasId') }}</span>
            <DwSelect
                v-model="taskForm.canvasId"
                size="sm"
                :options="taskCanvasSelectOptions"
                :disabled="canvasOptionsLoading || !taskCanvasSelectOptions.length"
            />
          </label>
          <p class="modal-hint">{{ t('platform.tasks.canvasHint') }}</p>
          <p v-if="!canvasOptionsLoading && !taskCanvasSelectOptions.length" class="modal-hint">
            {{ t('platform.canvas.empty') }}
          </p>
        </fieldset>

        <fieldset v-if="showDataQualityFields" class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.dataQuality') }}</legend>
          <p class="modal-hint">{{ t('workspace.platformCatalog.form.hint.dataQuality') }}</p>
          <label class="modal-field">
            <span>{{ t('workspace.platformCatalog.form.dqTemplateLabel') }}</span>
            <DwSelect
                v-model="dqTemplateId"
                size="sm"
                :options="dqTemplateOptions"
                @update:model-value="applySelectedDqTemplate"
            />
          </label>
          <p class="modal-hint">{{ dqTemplateHint }}</p>
          <p v-if="dqSharedTemplatesLoading" class="modal-hint">
            {{ t('workspace.platformCatalog.form.dqTemplate.sharedLoading') }}
          </p>
          <div class="modal-template-actions">
            <button
                type="button"
                class="dw-text-btn"
                :disabled="!canSaveDqUserTemplate || templateBusy"
                @click="saveCurrentAsDqUserTemplate"
            >
              {{ t('workspace.platformCatalog.form.dqTemplate.saveCurrent') }}
            </button>
            <button
                type="button"
                class="dw-text-btn"
                :disabled="!canSaveDqUserTemplate || templateBusy"
                @click="saveCurrentAsDqSharedTemplate"
            >
              {{ t('workspace.platformCatalog.form.dqTemplate.saveShared') }}
            </button>
            <button
                v-if="selectedDqUserTemplate"
                type="button"
                class="dw-text-btn"
                :disabled="!canSaveDqUserTemplate || templateBusy"
                @click="deleteSelectedDqUserTemplate"
            >
              {{ t('workspace.platformCatalog.form.dqTemplate.deleteSelected') }}
            </button>
            <button
                v-if="selectedDqSharedTemplate"
                type="button"
                class="dw-text-btn"
                :disabled="!canSaveDqUserTemplate || templateBusy"
                @click="deleteSelectedDqSharedTemplate"
            >
              {{ t('workspace.platformCatalog.form.dqTemplate.deleteShared') }}
            </button>
          </div>
          <DwInlineAlert
              v-if="templateFeedback"
              density="banner"
              variant="success"
              :message="templateFeedback"
          />
          <FormField :label="t('workspace.platformCatalog.form.sqlLabel')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="taskForm.sql"
                  :rows="5"
                  :spellcheck="false"
                  :placeholder="t('workspace.platformCatalog.form.hint.dqSql')"
                  variant="mono"
                />
            </template>
          </FormField>
          <div class="modal-form-grid">
            <label class="modal-field">
              <span>{{ t('workspace.platformCatalog.form.dqAssertionLabel') }}</span>
              <DwSelect v-model="taskForm.dqAssertion" size="sm" :options="dqAssertionOptions"/>
            </label>
            <FormField :label="t('workspace.platformCatalog.form.dqExpectedLabel')">
              <template #default="{ id }">
                <DwInput
                    :id="id"
                    v-model="taskForm.dqExpected"
                    class="modal-input--mono"
                    type="text"
                    :disabled="taskForm.dqAssertion === 'empty_result'"
                />
              </template>
            </FormField>
          </div>
          <SettingsSwitch
              v-model="taskForm.dqBlocking"
              :label="t('workspace.platformCatalog.form.dqBlockingLabel')"
          />
          <p class="modal-hint">{{ t('workspace.platformCatalog.form.hint.dqBlocking') }}</p>
          <FormField
              v-if="taskForm.dqAssertion === 'scalar_eq' || taskForm.dqAssertion === 'scalar_lte'"
              :label="t('workspace.platformCatalog.form.dqColumnLabel')"
          >
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="taskForm.dqColumn"
                  type="text"
                  :placeholder="t('workspace.platformCatalog.form.hint.dqColumn')"
                />
            </template>
          </FormField>
        </fieldset>

        <fieldset v-if="showHttpTriggerFields" class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.httpTrigger') }}</legend>
          <p class="modal-hint">{{ t('workspace.platformCatalog.form.hint.httpTrigger') }}</p>
          <label class="modal-field">
            <span>{{ t('workspace.platformCatalog.form.httpPresetLabel') }}</span>
            <DwSelect
                v-model="httpPresetId"
                size="sm"
                :options="httpPresetOptions"
            />
          </label>
          <p class="modal-hint">{{ t('workspace.platformCatalog.form.httpPresetHint') }}</p>
          <FormField :label="t('workspace.platformCatalog.form.httpUrlLabel')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="taskForm.httpUrl"
                    class="modal-input--mono"
                  type="url"
                  :placeholder="t('workspace.platformCatalog.form.hint.httpUrl')"
                />
            </template>
          </FormField>
          <div class="modal-form-grid">
            <label class="modal-field">
              <span>{{ t('workspace.platformCatalog.form.httpMethodLabel') }}</span>
              <DwSelect v-model="taskForm.httpMethod" size="sm" :options="httpMethodOptions"/>
            </label>
            <FormField :label="t('workspace.platformCatalog.form.httpTimeoutLabel')">
              <template #default="{ id }">
                <DwInput
                    :id="id"
                    v-model="taskForm.httpTimeoutMs"
                    class="modal-input--mono"
                    type="text"
                    inputmode="numeric"
                />
              </template>
            </FormField>
          </div>
          <FormField :label="t('workspace.platformCatalog.form.httpHeadersLabel')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="taskForm.httpHeadersJson"
                  :rows="3"
                  :spellcheck="false"
                  :placeholder="t('workspace.platformCatalog.form.hint.httpHeaders')"
                  variant="mono"
                />
            </template>
          </FormField>
          <FormField
              v-if="taskForm.httpMethod !== 'GET'"
              :label="t('workspace.platformCatalog.form.httpBodyLabel')"
          >
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="taskForm.httpBodyJson"
                  :rows="4"
                  :spellcheck="false"
                  :placeholder="t('workspace.platformCatalog.form.hint.httpBody')"
                  variant="mono"
                />
            </template>
          </FormField>
          <FormField :label="t('workspace.platformCatalog.form.httpStatusUrlLabel')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="taskForm.httpStatusUrlTemplate"
                    class="modal-input--mono"
                  type="text"
                    :spellcheck="false"
                  :placeholder="t('workspace.platformCatalog.form.hint.httpStatusUrl')"
                />
            </template>
          </FormField>
          <p class="modal-hint">{{ t('workspace.platformCatalog.form.hint.httpStatusUrl') }}</p>
        </fieldset>

        <fieldset v-if="showSqlSourceFields" class="modal-fieldset">
          <legend>{{ t('workspace.platformCatalog.form.section.sqlSource') }}</legend>
          <label class="modal-field">
            <span>{{ t('workspace.platformCatalog.form.sqlSourceLabel') }}</span>
            <DwSelect v-model="taskForm.sqlSource" size="sm" :options="sqlSourceOptions"/>
          </label>
          <p class="modal-hint">{{ t('workspace.platformCatalog.form.hint.sqlSource') }}</p>
          <p class="modal-hint">{{ t('workspace.platformCatalog.form.hint.productionApproval') }}</p>

          <FormField
              v-if="taskForm.sqlSource === 'inline'"
              :label="t('workspace.platformCatalog.form.sqlLabel')"
          >
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="taskForm.sql"
                  :rows="5"
                  :spellcheck="false"
                  :placeholder="t('workspace.platformCatalog.form.hint.sqlInline')"
                  variant="mono"
                />
            </template>
          </FormField>

          <FormField
              v-else-if="taskForm.sqlSource === 'workspace_file'"
              :label="t('workspace.platformCatalog.form.sqlFileLabel')"
          >
            <DwSelect
                v-model="taskForm.sqlFile"
                size="sm"
                :options="sqlFileOptions"
                :disabled="sqlFileOptionsLoading || !sqlFileOptions.length"
            />
            <p class="modal-hint">
              {{ sqlFileOptionsLoading
                ? t('workspace.platformCatalog.form.hint.sqlFileLoading')
                : sqlFileOptions.length
                  ? t('workspace.platformCatalog.form.hint.sqlFile')
                  : t('workspace.platformCatalog.form.hint.sqlFileEmpty') }}
            </p>
          </FormField>

          <template v-else>
            <div class="modal-form-grid">
              <FormField :label="t('workspace.platformCatalog.form.teamLabel')">
                <DwSelect
                    v-model="taskForm.teamId"
                    size="sm"
                    :options="teamSelectOptions"
                    :disabled="!teamSelectOptions.length"
                />
              </FormField>
              <FormField :label="t('workspace.platformCatalog.form.queryLabel')">
                <DwSelect
                    v-model="taskForm.queryId"
                    size="sm"
                    :options="sharedQueryOptions"
                    :disabled="sharedQueryOptionsLoading || !sharedQueryOptions.length"
                />
              </FormField>
            </div>
            <p class="modal-hint">
              {{ sharedQueryOptionsLoading
                ? t('workspace.platformCatalog.form.hint.queryLibraryLoading')
                : !teamSelectOptions.length
                  ? t('workspace.platformCatalog.form.hint.queryLibraryNoTeams')
                  : !sharedQueryOptions.length
                    ? t('workspace.platformCatalog.form.hint.queryLibraryEmpty')
                    : selectedSharedQueryHint
                      ? t('workspace.platformCatalog.form.hint.queryLibrarySelected', {
                        title: selectedSharedQueryHint,
                      })
                      : t('workspace.platformCatalog.form.hint.queryLibrary') }}
            </p>
          </template>
        </fieldset>

        <CollapsibleSection
            v-if="showTaskPayloadEditor"
            :title="t('workspace.platformCatalog.form.section.advanced')"
            :description="t('platform.tasks.payloadJson')"
            joined="single"
        >
          <FormField :label="t('platform.tasks.payloadJson')">
            <template #default="{ id }">
              <DwInput
                  :id="id"
                  v-model="taskForm.payloadJson"
                  :rows="4"
                  :spellcheck="false"
                  :placeholder="t('workspace.platformCatalog.form.hint.payloadJson')"
                  variant="mono"
                />
            </template>
          </FormField>
        </CollapsibleSection>
      </template>

      <DwInlineAlert :message="error"/>
    </form>

    <template #footer>
      <ModalActions
          :confirm-label="t('platform.common.save')"
          :confirm-disabled="!canSave"
          :confirm-loading="saving"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>

  <ConfirmDialog
      :open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmLabel"
      :confirm-variant="confirmVariant"
      @update:open="onConfirmOpenUpdate"
      @confirm="onConfirmDialog"
  />
</template>

<style scoped>
:deep(.modal-input--mono) {
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
}

.modal-fieldset:last-of-type {
  margin-bottom: 0;
}

.modal-template-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 4px 0 8px;
}
</style>
