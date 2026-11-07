import {computed, reactive, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {WorkspaceTab} from '@/core/types'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {extractConnectionsFromTree} from '@/features/explorer/utils/tree-targets'
import {useLayoutStore} from '@/features/layout/stores/layout'
import type {SelectOption} from '@/core/components/select.types'
import type {TableMigrationPreflightResult, TableMigrationResult, TableMigrationRowDiffResult} from '@/shared/api/types'
import {
    buildMigrationRunRecord,
    buildWatermarkColumnSelectOptions,
    canProceedMigration,
    computeMigrationProgressPercent,
    createDefaultTableMigrationForm,
    createMigrationRunId,
    defaultOrderByColumnsFromPreflight,
    downloadMigrationRunReport,
    fetchTablesForScope,
    formatMigrationLogDisplay,
    filterMigrationLogsForDisplay,
    formatMigrationDuration,
    formatMigrationTableProgressLabel,
    formatMigrationRunLogText,
    resolveMigrationBlockedReason,
    resolveMigrationTables,
    mergeRecommendedWatermarkColumns,
    mergeSuggestedOrderByColumns,
    pauseMigrationJob,
    pickDefaultWatermarkColumn,
    resumeTableMigrationRun,
    canResumeMigrationRun,
    cancelMigrationJob,
    recordToMigrationForm,
    runTableMigration,
    runTableMigrationPreflight,
    runTableMigrationRowDiff,
    selectPreflightTableName,
    summarizeMigrationPreflightScan,
    summarizeMigrationResults,
    toggleOrderByColumn,
    type MigrationLogLine,
    type TableMigrationRunProgress,
    type TableMigrationRunRecord,
    type TableMigrationWizardForm,
    validateTableMigrationForm,
    validateTableMigrationForPreflight,
} from '@/features/explorer/services/table-migration.service'
import {useMigrationTaskStore} from '@/features/explorer/stores/migration-task-store'
import {useTeamStore} from '@/features/team/stores/team-store'
import {normalizeConnectionEnvironment} from '@/features/connection/services/connection-environment.service'
import {resolveProductionApprovalTeams} from '@/features/team/services/production-approval-policy.service'
import {buildDataMigrationApprovalSql} from '@/features/explorer/services/data-migration-approval.service'
import type {MigrationFlowStep} from '@/features/workspace/components/migration/migration-wizard.types'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {packPaywallContextKey} from '@/features/pack/services/pack-i18n'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

export function useTableMigrationWizard(tab: WorkspaceTab) {
    const {t} = useI18n()
    const explorer = useExplorerStore()
    const layout = useLayoutStore()
    const migrationTasks = useMigrationTaskStore()
    const teamStore = useTeamStore()
    const entitlement = useEntitlementStore()

    const form = ref<TableMigrationWizardForm>(createDefaultTableMigrationForm())
    const tableFilter = ref('')
    const showSelectedOnly = ref(false)
    const showAdvancedOptions = ref(false)
    const preflightStatusFilter = ref<'all' | 'ready' | 'warn' | 'blocked'>('all')
    const availableTables = ref<string[]>([])
    const tablesLoading = ref(false)
    const tablesLoadError = ref(false)
    const formError = ref<string | null>(null)
    const preflightLoading = ref(false)
    const preflightError = ref<string | null>(null)
    const preflightResult = ref<TableMigrationPreflightResult | null>(null)
    const preflightSnapshot = ref('')
    const rowDiffLoading = ref(false)
    const rowDiffError = ref<string | null>(null)
    const rowDiffResult = ref<TableMigrationRowDiffResult | null>(null)
    const selectedPreflightTable = ref<string | null>(null)
    const wizardStep = ref<MigrationFlowStep>('configure')
    const pausing = ref(false)
    const cancelling = ref(false)
    const resuming = ref(false)
    const activeJobId = ref<string | null>(null)
    const productionApprovalDialogOpen = ref(false)
    const productionApprovalSubmitting = ref(false)
    const productionApprovalError = ref('')
    const productionApprovalSql = ref('')

    const running = computed(() => migrationTasks.isRunning)
    const canPauseMigration = computed(() => Boolean(activeJobId.value && running.value && !cancelling.value && !pausing.value))
    const canCancelMigration = computed(() => Boolean(activeJobId.value && running.value && !cancelling.value))
    const progress = computed<TableMigrationRunProgress | null>(() => migrationTasks.activeProgress)
    const migrationResults = computed<TableMigrationResult[]>(() => {
        if (migrationTasks.activeRun) return migrationTasks.activeRun.results
        return migrationTasks.selectedRecord?.results ?? []
    })
    const migrationRunLogsFull = computed<MigrationLogLine[]>(() => {
        if (migrationTasks.activeRun) return migrationTasks.activeRun.logs
        return migrationTasks.selectedRecord?.logs ?? []
    })
    const migrationRunLogs = computed(() => filterMigrationLogsForDisplay(migrationRunLogsFull.value))
    const migrationRunLogsCompacted = computed(
        () => migrationRunLogsFull.value.length > migrationRunLogs.value.length,
    )
    const migrationRunRecord = computed<TableMigrationRunRecord | null>(() => {
        const record = migrationTasks.selectedRecord
        if (!record || record.status === 'running') return null
        return record
    })

    const wizardSteps = computed(() => [
        {id: 'configure' as const, label: t('explorer.tableMigrationWizard.flowSteps.configure'), number: 1},
        {id: 'preflight' as const, label: t('explorer.tableMigrationWizard.flowSteps.preflight'), number: 2},
        {id: 'running' as const, label: t('explorer.tableMigrationWizard.flowSteps.running'), number: 3},
        {id: 'complete' as const, label: t('explorer.tableMigrationWizard.flowSteps.complete'), number: 4},
    ])

    const source = computed(() => tab.migrationSource ?? null)
    const preselectedTables = computed(() => tab.migrationPreselectedTables ?? [])
    const connections = computed(() => extractConnectionsFromTree(explorer.tree))

    const filteredTables = computed(() => {
        let tables = availableTables.value
        if (showSelectedOnly.value) {
            const selected = new Set(form.value.selectedTables)
            tables = tables.filter((name) => selected.has(name))
        }
        const query = tableFilter.value.trim().toLowerCase()
        if (query) {
            tables = tables.filter((name) => name.toLowerCase().includes(query))
        }
        return tables
    })

    const tablesListFooterLabel = computed(() => {
        const total = availableTables.value.length
        const visible = filteredTables.value.length
        if (showSelectedOnly.value || tableFilter.value.trim()) {
            return t('explorer.tableMigrationWizard.tablesFiltered', {visible, total})
        }
        return t('explorer.tableMigrationWizard.tablesTotal', {count: total})
    })

    const allSelected = computed({
        get: () =>
            filteredTables.value.length > 0
            && filteredTables.value.every((name) => form.value.selectedTables.includes(name)),
        set: (checked: boolean) => {
            if (checked) {
                const merged = new Set([...form.value.selectedTables, ...filteredTables.value])
                form.value.selectedTables = [...merged]
                return
            }
            form.value.selectedTables = form.value.selectedTables.filter(
                (name) => !filteredTables.value.includes(name),
            )
        },
    })

    const targetDatabases = computed(() =>
        connections.value.find((item) => item.id === form.value.targetConnectionId)?.databases ?? [],
    )

    const progressPercent = computed(() => computeMigrationProgressPercent(progress.value))

    const progressDetailLabel = computed(() =>
        formatMigrationTableProgressLabel(progress.value, t),
    )

    const runStartedAt = computed(() =>
        migrationTasks.activeRun?.startedAt ?? migrationRunRecord.value?.startedAt ?? null,
    )

    const targetConnectionLabel = computed(() =>
        connections.value.find((item) => item.id === form.value.targetConnectionId)?.label
        ?? form.value.targetConnectionId,
    )

    const completionSummary = computed(() => {
        if (!migrationRunRecord.value || running.value) return null
        return migrationRunRecord.value.summary
    })

    const completionStatusKey = computed(() => {
        const status = migrationRunRecord.value?.status
        if (!status) return null
        return `explorer.tableMigrationWizard.runStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`
    })

    const selectedCountLabel = computed(() =>
        t('explorer.tableMigrationWizard.selectedCount', {count: form.value.selectedTables.length}),
    )

    const targetConnectionOptions = computed<SelectOption[]>(() =>
        connections.value.map((conn) => ({value: conn.id, label: conn.label})),
    )

    const targetDatabaseOptions = computed<SelectOption[]>(() =>
        targetDatabases.value.map((db) => ({value: db.label, label: db.label})),
    )

    const targetMissingPolicyOptions = computed<SelectOption[]>(() => [
        {value: 'block', label: t('explorer.tableMigrationWizard.targetMissingPolicyBlock')},
        {value: 'skip', label: t('explorer.tableMigrationWizard.targetMissingPolicySkip')},
        {value: 'create', label: t('explorer.tableMigrationWizard.targetMissingPolicyCreate')},
    ])

    const selectedPreflightDetail = computed(() =>
        preflightResult.value?.tables.find((item) => item.tableName === selectedPreflightTable.value) ?? null,
    )

    const recommendedWatermarkColumns = computed(() =>
        mergeRecommendedWatermarkColumns(preflightResult.value, form.value.selectedTables),
    )

    const suggestedOrderByOptions = computed(() =>
        mergeSuggestedOrderByColumns(preflightResult.value, form.value.selectedTables),
    )

    const watermarkColumnSelectOptions = computed<SelectOption[]>(() =>
        buildWatermarkColumnSelectOptions(
            preflightResult.value,
            form.value.selectedTables,
            {
                pk: t('explorer.tableMigrationWizard.watermarkRecommendPk'),
                time: t('explorer.tableMigrationWizard.watermarkRecommendTime'),
                numeric: t('explorer.tableMigrationWizard.watermarkRecommendNumeric'),
            },
        ),
    )

    const filteredPreflightTables = computed(() => {
        const tables = preflightResult.value?.tables ?? []
        if (preflightStatusFilter.value === 'all') return tables
        return tables.filter((item) => item.status === preflightStatusFilter.value)
    })

    const preflightScanSummary = computed(() =>
        summarizeMigrationPreflightScan(
            form.value.mode,
            preflightResult.value,
            form.value.selectedTables,
        ),
    )

    const truncateLockedByMode = computed(() => form.value.mode === 'FULL_REPLACE')

    const modeDescriptionKey = computed(() => {
        const keys: Record<TableMigrationWizardForm['mode'], string> = {
            FULL_APPEND: 'explorer.tableMigrationWizard.modeFullAppendDesc',
            FULL_REPLACE: 'explorer.tableMigrationWizard.modeFullReplaceDesc',
            INCR_APPEND: 'explorer.tableMigrationWizard.modeIncrAppendDesc',
            PK_UPSERT: 'explorer.tableMigrationWizard.modePkUpsertDesc',
        }
        return keys[form.value.mode]
    })

    const canStartMigration = computed(() => {
        if (!source.value || running.value || preflightLoading.value) return false
        const code = validateTableMigrationForm(
            source.value,
            form.value.targetConnectionId,
            form.value.targetDatabase,
            form.value,
        )
        if (code) return false
        if (!preflightResult.value || preflightStale.value) return true
        return canProceedMigration(form.value, preflightResult.value)
    })

    const targetConnectionNode = computed(() => {
        const connectionId = form.value.targetConnectionId?.trim()
        if (!connectionId) return undefined
        return explorer.findNode(connectionId)
    })

    const targetConnectionEnv = computed(() =>
        normalizeConnectionEnvironment(
            targetConnectionNode.value?.env,
            targetConnectionNode.value?.envCustom,
        ).env,
    )

    const migrationApprovalSqlPreview = computed(() => {
        if (!source.value || !form.value.targetConnectionId || !form.value.targetDatabase) return ''
        const tables = resolveMigrationTables(form.value, preflightResult.value)
        return buildDataMigrationApprovalSql({
            sourceConnectionLabel: source.value.connectionLabel,
            sourceDatabase: source.value.database,
            targetConnectionLabel: targetConnectionLabel.value,
            targetDatabase: form.value.targetDatabase,
            form: form.value,
            tables,
        })
    })

    const productionApprovalTeams = computed(() => {
        if (!form.value.targetConnectionId || !migrationApprovalSqlPreview.value) return []
        return resolveProductionApprovalTeams({
            env: targetConnectionEnv.value,
            sql: migrationApprovalSqlPreview.value,
            connectionId: form.value.targetConnectionId,
            teams: teamStore.teams,
        })
    })

    const needsProductionApproval = computed(() => productionApprovalTeams.value.length > 0)

    const migrateActionLabel = computed(() =>
        needsProductionApproval.value
            ? t('console.productionApproval.submitForApproval')
            : t('explorer.tableMigrationWizard.migrate'),
    )

    const footerHint = computed(() => {
        switch (wizardStep.value) {
            case 'configure':
                if (!form.value.selectedTables.length) {
                    return t('explorer.tableMigrationWizard.footerHintSelectTables')
                }
                return t('explorer.tableMigrationWizard.footerHintConfigure', {
                    count: form.value.selectedTables.length,
                })
            case 'preflight':
                if (preflightLoading.value) {
                    return t('explorer.tableMigrationWizard.footerHintPreflightRunning')
                }
                if (preflightStale.value) {
                    return t('explorer.tableMigrationWizard.preflightStale')
                }
                if (migrateBlockedReason.value) {
                    return migrateBlockedReason.value
                }
                if (needsProductionApproval.value) {
                    return t('explorer.tableMigrationWizard.footerHintProductionApproval')
                }
                if (preflightResult.value) {
                    return t('explorer.tableMigrationWizard.footerHintPreflightReady', {
                        count: migrateTablesCount.value,
                    })
                }
                return t('explorer.tableMigrationWizard.preflightStartHint')
            case 'running':
                return t('explorer.tableMigrationWizard.footerHintRunning')
            default:
                return ''
        }
    })

    function buildPreflightSnapshot(current: TableMigrationWizardForm): string {
        return JSON.stringify({
            targetConnectionId: current.targetConnectionId,
            targetDatabase: current.targetDatabase,
            selectedTables: [...current.selectedTables].sort(),
            whereClause: current.whereClause.trim(),
            targetMissingPolicy: current.targetMissingPolicy,
        })
    }

    const currentPreflightSnapshot = computed(() => buildPreflightSnapshot(form.value))

    const preflightStale = computed(() =>
        Boolean(preflightResult.value && preflightSnapshot.value !== currentPreflightSnapshot.value),
    )

    const canCheck = computed(() => {
        if (!source.value || running.value || preflightLoading.value) return false
        return !validateTableMigrationForPreflight(
            source.value,
            form.value.targetConnectionId,
            form.value.targetDatabase,
            form.value,
        )
    })

    const canMigrate = computed(() => {
        if (!source.value || running.value || preflightLoading.value) return false
        if (!preflightResult.value || preflightStale.value) return false
        return canProceedMigration(form.value, preflightResult.value)
    })

    const migrateBlockedReason = computed(() => {
        if (!preflightResult.value || preflightStale.value || running.value || preflightLoading.value) {
            return null
        }
        if (canMigrate.value) return null
        const reason = resolveMigrationBlockedReason(form.value, preflightResult.value)
        return reason ? t(`explorer.tableMigrationWizard.errors.${reason}`) : null
    })

    const migrateTablesCount = computed(() =>
        resolveMigrationTables(form.value, preflightResult.value).length,
    )

    function flowStepIndex(step: MigrationFlowStep): number {
        return wizardSteps.value.findIndex((item) => item.id === step)
    }

    function isFlowStepAccessible(step: MigrationFlowStep): boolean {
        if (running.value) return step === 'running'
        switch (step) {
            case 'configure':
                return true
            case 'preflight':
                return canCheck.value
            case 'running':
                return false
            case 'complete':
                return Boolean(migrationRunRecord.value)
        }
    }

    function isFlowStepCompleted(step: MigrationFlowStep): boolean {
        return flowStepIndex(step) < flowStepIndex(wizardStep.value)
    }

    function goToFlowStep(step: string) {
        const flowStep = step as MigrationFlowStep
        if (!isFlowStepAccessible(flowStep)) return
        if (flowStep === 'preflight') {
            void goToPreflightStep()
            return
        }
        wizardStep.value = flowStep
    }

    watch(
        () => [source.value, preselectedTables.value] as const,
        () => {
            void resetWizard()
        },
        {immediate: true, deep: true},
    )

    watch(
        () => form.value.mode,
        (mode) => {
            if (mode === 'FULL_REPLACE') {
                form.value.truncateTarget = true
            }
        },
    )

    watch(filteredPreflightTables, (tables) => {
        if (!tables.length) {
            selectedPreflightTable.value = null
            return
        }
        if (!tables.some((item) => item.tableName === selectedPreflightTable.value)) {
            selectedPreflightTable.value = tables[0]?.tableName ?? null
        }
    })

    watch(
        () => form.value.targetConnectionId,
        async (connectionId, previousConnectionId) => {
            if (!connectionId) {
                form.value.targetDatabase = ''
                return
            }
            await explorer.ensureChildrenLoaded(connectionId)
            const databases = connections.value.find((item) => item.id === connectionId)?.databases ?? []
            const currentDatabase = form.value.targetDatabase.trim()
            if (previousConnectionId && previousConnectionId !== connectionId) {
                form.value.targetDatabase = ''
                return
            }
            if (currentDatabase && !databases.some((item) => item.label === currentDatabase)) {
                form.value.targetDatabase = ''
            }
        },
    )

    async function resetWizard() {
        if (!source.value) return
        form.value = createDefaultTableMigrationForm(preselectedTables.value)
        if (tab.migrationInitialTarget) {
            form.value.targetConnectionId = tab.migrationInitialTarget.connectionId
            form.value.targetDatabase = tab.migrationInitialTarget.database
        }
        if (tab.migrationSourceSelectSql?.trim()) {
            form.value.sourceSelectSql = tab.migrationSourceSelectSql.trim()
            form.value.migrationTargetTableName = tab.migrationTargetTableName?.trim() ?? ''
        }
        tableFilter.value = ''
        showSelectedOnly.value = false
        showAdvancedOptions.value = false
        preflightStatusFilter.value = 'all'
        availableTables.value = []
        tablesLoading.value = false
        tablesLoadError.value = false
        formError.value = null
        preflightLoading.value = false
        preflightError.value = null
        preflightResult.value = null
        preflightSnapshot.value = ''
        rowDiffLoading.value = false
        rowDiffError.value = null
        rowDiffResult.value = null
        selectedPreflightTable.value = null
        wizardStep.value = 'configure'
        await loadSourceTables()
    }

    async function loadSourceTables() {
        if (!source.value) return
        tablesLoading.value = true
        tablesLoadError.value = false
        try {
            const scope = source.value
            availableTables.value = await fetchTablesForScope(explorer.tree, scope, {
                ensureChildrenLoaded: (nodeId) => explorer.ensureChildrenLoaded(nodeId),
            })
        } catch {
            tablesLoadError.value = true
            availableTables.value = []
        } finally {
            tablesLoading.value = false
        }
    }

    function toggleTable(name: string, checked: boolean) {
        if (checked) {
            if (!form.value.selectedTables.includes(name)) {
                form.value.selectedTables = [...form.value.selectedTables, name]
            }
            return
        }
        form.value.selectedTables = form.value.selectedTables.filter((item) => item !== name)
    }

    function clearSelection() {
        form.value.selectedTables = []
    }

    function setPreflightStatusFilter(filter: 'all' | 'ready' | 'warn' | 'blocked') {
        preflightStatusFilter.value = filter
    }

    function formatRowCount(value: number | null): string {
        if (value == null) return '—'
        return value.toLocaleString()
    }

    function formatIssue(issue: string): string {
        const key = `explorer.tableMigrationWizard.issues.${issue}`
        const translated = t(key)
        return translated === key ? issue : translated
    }

    function formatStatus(status: string): string {
        const keyByStatus: Record<string, string> = {
            ready: 'explorer.tableMigrationWizard.statusReady',
            warn: 'explorer.tableMigrationWizard.statusWarn',
            blocked: 'explorer.tableMigrationWizard.statusBlocked',
        }
        const key = keyByStatus[status]
        return key ? t(key) : status
    }

    function formatMappingWarning(warning: string | null | undefined): string {
        if (!warning) return ''
        const key = `explorer.tableMigrationWizard.mappingWarnings.${warning}`
        const translated = t(key)
        return translated === key ? warning : translated
    }

    function selectPreflightTable(tableName: string) {
        selectedPreflightTable.value = selectPreflightTableName(selectedPreflightTable.value, tableName)
    }

    async function copySuggestedDdl() {
        const ddl = selectedPreflightDetail.value?.suggestedCreateDdl
        if (!ddl) return
        try {
            await navigator.clipboard.writeText(ddl)
            layout.showSuccessToast(t('explorer.tableMigrationWizard.ddlCopied'))
        } catch {
            layout.showErrorToast(t('explorer.tableMigrationWizard.ddlCopyFailed'))
        }
    }

    function formatValidation(validation: string | null | undefined): string {
        const keyByValidation: Record<string, string> = {
            match: 'explorer.tableMigrationWizard.validationMatch',
            mismatch: 'explorer.tableMigrationWizard.validationMismatch',
            skipped: 'explorer.tableMigrationWizard.validationSkipped',
        }
        const key = validation ? keyByValidation[validation] : undefined
        return key ? t(key) : (validation ?? '—')
    }

    function resolveErrorMessage(error: unknown, fallbackKey: string): string {
        if (!(error instanceof Error)) {
            return t(fallbackKey)
        }
        const key = `explorer.tableMigrationWizard.errors.${error.message}`
        const translated = t(key)
        return translated === key ? error.message : translated
    }

    async function goToPreflightStep() {
        if (!source.value || running.value) return
        const code = validateTableMigrationForPreflight(
            source.value,
            form.value.targetConnectionId,
            form.value.targetDatabase,
            form.value,
        )
        if (code) {
            formError.value = t(`explorer.tableMigrationWizard.errors.${code}`)
            return
        }
        formError.value = null
        preflightError.value = null
        wizardStep.value = 'preflight'
        if (!preflightResult.value || preflightStale.value) {
            await runPreflight()
        }
    }

    function backToConfigureStep() {
        if (running.value) return
        wizardStep.value = 'configure'
    }

    function startNewMigration() {
        if (running.value) return
        preflightResult.value = null
        preflightSnapshot.value = ''
        preflightError.value = null
        rowDiffResult.value = null
        rowDiffError.value = null
        selectedPreflightTable.value = null
        formError.value = null
        wizardStep.value = 'configure'
    }

    async function runPreflight() {
        if (!source.value || preflightLoading.value || running.value) return
        const code = validateTableMigrationForPreflight(
            source.value,
            form.value.targetConnectionId,
            form.value.targetDatabase,
            form.value,
        )
        if (code) {
            formError.value = t(`explorer.tableMigrationWizard.errors.${code}`)
            return
        }
        formError.value = null
        preflightError.value = null
        rowDiffResult.value = null
        rowDiffError.value = null
        preflightLoading.value = true
        try {
            preflightResult.value = await runTableMigrationPreflight(source.value, form.value)
            preflightSnapshot.value = currentPreflightSnapshot.value
            selectedPreflightTable.value = preflightResult.value.tables[0]?.tableName ?? null
            if (!form.value.orderByColumns.length) {
                form.value.orderByColumns = defaultOrderByColumnsFromPreflight(
                    preflightResult.value,
                    form.value.selectedTables,
                )
            }
            if (form.value.mode === 'INCR_APPEND' && !form.value.watermarkColumn.trim()) {
                form.value.watermarkColumn = pickDefaultWatermarkColumn(
                    preflightResult.value,
                    form.value.selectedTables,
                )
            }
        } catch (error) {
            preflightResult.value = null
            const message = resolveErrorMessage(error, 'explorer.tableMigrationFailed')
            preflightError.value = message
            formError.value = message
        } finally {
            preflightLoading.value = false
        }
    }

    async function runRowDiff() {
        if (!source.value || rowDiffLoading.value || running.value) return
        if (form.value.mode !== 'PK_UPSERT') return
        const tableName = selectedPreflightTable.value?.trim()
        if (!tableName) {
            rowDiffError.value = t('explorer.tableMigrationWizard.rowDiffNeedTable')
            return
        }
        rowDiffError.value = null
        rowDiffLoading.value = true
        try {
            rowDiffResult.value = await runTableMigrationRowDiff(source.value, form.value, tableName)
        } catch (error) {
            rowDiffResult.value = null
            rowDiffError.value = resolveErrorMessage(error, 'explorer.tableMigrationWizard.rowDiffFailed')
        } finally {
            rowDiffLoading.value = false
        }
    }

    function formatDuration(ms: number): string {
        return formatMigrationDuration(ms)
    }

    function formatLogLine(line: MigrationLogLine): string {
        return formatMigrationLogDisplay(line, t)
    }

    function openMigrationTasksPanel(recordId?: string) {
        if (recordId) migrationTasks.selectRecord(recordId)
        layout.activeShortcutPanel = 'migration'
    }

    function formatTimestamp(value: string): string {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return value
        return date.toLocaleString()
    }

    async function copyMigrationLog() {
        const record = migrationRunRecord.value ?? migrationTasks.selectedRecord
        if (!record) return
        try {
            await navigator.clipboard.writeText(formatMigrationRunLogText(record))
            layout.showSuccessToast(t('explorer.tableMigrationWizard.logCopied'))
        } catch {
            layout.showErrorToast(t('explorer.tableMigrationWizard.ddlCopyFailed'))
        }
    }

    function downloadMigrationReport() {
        const record = migrationRunRecord.value ?? migrationTasks.selectedRecord
        if (!record || record.status === 'running') return
        downloadMigrationRunReport(record)
        layout.showSuccessToast(t('explorer.tableMigrationWizard.reportDownloaded'))
    }

    async function pauseActiveMigration() {
        if (!canPauseMigration.value || !activeJobId.value || pausing.value) return
        pausing.value = true
        try {
            await pauseMigrationJob(activeJobId.value)
            // Keep pausing=true until the run settles in startMigration / resume finally.
        } catch (error) {
            pausing.value = false
            const message = resolveCaughtApiErrorMessage(
                error,
                t,
                'explorer.tableMigrationWizard.errors.migrationJobFailed',
            )
            layout.showErrorToast(t('explorer.tableMigrationWizard.errors.runFailed', {detail: message}))
        }
    }

    async function cancelActiveMigration() {
        if (!canCancelMigration.value || !activeJobId.value || cancelling.value) return
        cancelling.value = true
        try {
            await cancelMigrationJob(activeJobId.value)
        } catch (error) {
            cancelling.value = false
            const message = resolveCaughtApiErrorMessage(
                error,
                t,
                'explorer.tableMigrationWizard.errors.migrationJobFailed',
            )
            layout.showErrorToast(t('explorer.tableMigrationWizard.errors.runFailed', {detail: message}))
        }
    }

    const canResumeFromWizard = computed(() => {
        const record = migrationRunRecord.value
        if (!record || running.value || resuming.value) return false
        return canResumeMigrationRun(record)
    })

    async function resumeFromCheckpoint() {
        const record = migrationRunRecord.value
        if (!record || !canResumeFromWizard.value) return
        resuming.value = true
        const startedAt = record.startedAt
        wizardStep.value = 'running'
        migrationTasks.startRun({
            id: record.id,
            startedAt,
            source: record.source,
            target: record.target,
            options: record.options,
            tablesPlanned: [...record.tablesPlanned],
        })
        activeJobId.value = record.id
        try {
            const outcome = await resumeTableMigrationRun(
                record,
                (nextProgress) => migrationTasks.setProgress(nextProgress),
                (line) => migrationTasks.appendLog(line),
            )
            const finishedAt = new Date().toISOString()
            const nextRecord = buildMigrationRunRecord({
                id: record.id,
                startedAt,
                finishedAt,
                source: {
                    connectionId: record.source.connectionId,
                    connectionLabel: record.source.connectionLabel,
                    database: record.source.database,
                    dbType: record.source.dbType as import('@/core/types').DbType,
                },
                targetConnectionId: record.target.connectionId,
                targetConnectionLabel: record.target.connectionLabel,
                targetDatabase: record.target.database,
                form: recordToMigrationForm(record),
                tablesPlanned: [...record.tablesPlanned],
                results: outcome.results,
                logs: migrationTasks.activeRun?.logs ?? record.logs,
                jobStatus: outcome.cancelled ? 'cancelled' : outcome.paused ? 'paused' : undefined,
            })
            migrationTasks.completeRun(nextRecord)
            if (outcome.cancelled) {
                layout.showWarningToast(t('explorer.tableMigrationWizard.migrationCancelled'))
            } else if (outcome.paused) {
                layout.showSuccessToast(t('explorer.tableMigrationWizard.migrationPaused'))
            } else {
                const summary = summarizeMigrationResults(outcome.results)
                if (summary.failed > 0) {
                    layout.showWarningToast(t('explorer.tableMigrationPartial', summary))
                } else {
                    layout.showSuccessToast(t('explorer.tableMigrationSuccess', summary))
                }
            }
        } catch (error) {
            migrationTasks.abortRun()
            const message = resolveCaughtApiErrorMessage(
                error,
                t,
                'explorer.tableMigrationWizard.errors.migrationJobFailed',
            )
            layout.showErrorToast(t('explorer.tableMigrationWizard.errors.runFailed', {detail: message}))
        } finally {
            pausing.value = false
            cancelling.value = false
            activeJobId.value = null
            resuming.value = false
            wizardStep.value = 'complete'
        }
    }

    async function startMigration() {
        if (!source.value || running.value || preflightLoading.value) return
        const code = validateTableMigrationForm(
            source.value,
            form.value.targetConnectionId,
            form.value.targetDatabase,
            form.value,
        )
        if (code) {
            formError.value = t(`explorer.tableMigrationWizard.errors.${code}`)
            return
        }
        const usesViewModelSource = Boolean(form.value.sourceSelectSql?.trim())
        if (!usesViewModelSource) {
            if (!preflightResult.value || preflightStale.value) {
                await runPreflight()
                if (!preflightResult.value) return
            }
            const blockedReason = resolveMigrationBlockedReason(form.value, preflightResult.value!)
            if (blockedReason) {
                formError.value = t(`explorer.tableMigrationWizard.errors.${blockedReason}`)
                return
            }
        } else if (!form.value.migrationTargetTableName?.trim()) {
            formError.value = t('explorer.tableMigrationWizard.errors.targetTableRequired')
            return
        }
        formError.value = null
        if (!entitlement.isPackUsable('pack.migration')) {
            entitlement.openPaywall('pack.migration', 'migration.trial')
            layout.showWarningToast(t(packPaywallContextKey('migration.trial')))
        }
        if (needsProductionApproval.value) {
            productionApprovalSql.value = migrationApprovalSqlPreview.value
            productionApprovalError.value = ''
            productionApprovalDialogOpen.value = true
            return
        }
        wizardStep.value = 'running'
        await submit()
    }

    async function onSubmitProductionApproval(teamId: string) {
        if (!source.value || !form.value.targetConnectionId) return
        const sql = productionApprovalSql.value.trim() || migrationApprovalSqlPreview.value
        if (!sql) return

        productionApprovalSubmitting.value = true
        productionApprovalError.value = ''
        try {
            await teamStore.submitProductionApproval(teamId, {
                connectionId: form.value.targetConnectionId,
                connectionName: targetConnectionLabel.value,
                database: form.value.targetDatabase,
                sql,
            })
            productionApprovalDialogOpen.value = false
            layout.showSuccessToast(t('explorer.tableMigrationWizard.productionApprovalSubmitted'))
        } catch (error) {
            productionApprovalError.value =
                resolveCaughtApiErrorMessage(error, t, 'console.productionApproval.submitFailed')
        } finally {
            productionApprovalSubmitting.value = false
        }
    }

    async function submit() {
        if (!source.value || running.value) return
        const usesViewModelSource = Boolean(form.value.sourceSelectSql?.trim())
        if (!usesViewModelSource) {
            if (!preflightResult.value || preflightStale.value) {
                formError.value = t('explorer.tableMigrationWizard.errors.preflightRequired')
                return
            }
            const blockedReason = resolveMigrationBlockedReason(form.value, preflightResult.value)
            if (blockedReason) {
                formError.value = t(`explorer.tableMigrationWizard.errors.${blockedReason}`)
                return
            }
        }
        const code = validateTableMigrationForm(
            source.value,
            form.value.targetConnectionId,
            form.value.targetDatabase,
            form.value,
        )
        if (code) {
            formError.value = t(`explorer.tableMigrationWizard.errors.${code}`)
            return
        }
        formError.value = null
        wizardStep.value = 'running'

        const runId = createMigrationRunId()
        const startedAt = new Date().toISOString()
        const tablesPlanned = resolveMigrationTables(form.value, preflightResult.value)

        migrationTasks.startRun({
            id: runId,
            startedAt,
            source: {
                connectionId: source.value.connectionId,
                connectionLabel: source.value.connectionLabel,
                database: source.value.database,
                dbType: source.value.dbType,
            },
            target: {
                connectionId: form.value.targetConnectionId,
                connectionLabel: targetConnectionLabel.value,
                database: form.value.targetDatabase,
            },
            options: {
                mode: form.value.mode,
                watermarkColumn: form.value.watermarkColumn.trim(),
                orderByColumns: [...form.value.orderByColumns],
                whereClause: form.value.whereClause.trim(),
                batchSize: form.value.batchSize,
                throttleMs: form.value.throttleMs,
                truncateTarget: form.value.truncateTarget,
                targetMissingPolicy: form.value.targetMissingPolicy,
                conflictStrategy: form.value.conflictStrategy,
            },
            tablesPlanned,
        })
        openMigrationTasksPanel(runId)
        activeJobId.value = runId

        try {
            const outcome = await runTableMigration(
                source.value,
                {...form.value, selectedTables: [...form.value.selectedTables]},
                (nextProgress) => {
                    migrationTasks.setProgress(nextProgress)
                },
                preflightResult.value,
                (line) => {
                    migrationTasks.appendLog(line)
                },
                {jobId: runId},
            )
            const finishedAt = new Date().toISOString()
            const record = buildMigrationRunRecord({
                id: runId,
                startedAt,
                finishedAt,
                source: source.value,
                targetConnectionId: form.value.targetConnectionId,
                targetConnectionLabel: targetConnectionLabel.value,
                targetDatabase: form.value.targetDatabase,
                form: form.value,
                tablesPlanned,
                results: outcome.results,
                logs: migrationRunLogsFull.value,
                jobStatus: outcome.cancelled ? 'cancelled' : outcome.paused ? 'paused' : undefined,
            })
            migrationTasks.completeRun(record)

            if (outcome.cancelled) {
                layout.showWarningToast(t('explorer.tableMigrationWizard.migrationCancelled'))
            } else if (outcome.paused) {
                layout.showSuccessToast(t('explorer.tableMigrationWizard.migrationPaused'))
            } else {
                const summary = summarizeMigrationResults(outcome.results)
                if (summary.failed > 0) {
                    layout.showWarningToast(t('explorer.tableMigrationPartial', summary))
                } else if (summary.validationMismatch > 0) {
                    layout.showWarningToast(t('explorer.tableMigrationValidationWarn', {
                        tables: summary.tables,
                        rows: summary.rows,
                        mismatch: summary.validationMismatch,
                    }))
                } else {
                    layout.showSuccessToast(t('explorer.tableMigrationSuccess', summary))
                }
            }
        } catch (error) {
            const finishedAt = new Date().toISOString()
            if (migrationRunLogsFull.value.length) {
                const record = buildMigrationRunRecord({
                    id: runId,
                    startedAt,
                    finishedAt,
                    source: source.value,
                    targetConnectionId: form.value.targetConnectionId,
                    targetConnectionLabel: targetConnectionLabel.value,
                    targetDatabase: form.value.targetDatabase,
                    form: form.value,
                    tablesPlanned,
                    results: migrationResults.value,
                    logs: migrationRunLogsFull.value,
                })
                migrationTasks.completeRun(record)
            }
            layout.showErrorToast(resolveErrorMessage(error, 'explorer.tableMigrationFailed'))
            if (!migrationRunLogsFull.value.length) {
                migrationTasks.abortRun()
            }
        } finally {
            pausing.value = false
            cancelling.value = false
            activeJobId.value = null
            if (migrationTasks.isRunning) {
                migrationTasks.abortRun()
            }
            if (migrationRunRecord.value || migrationResults.value.length || migrationRunLogsFull.value.length) {
                wizardStep.value = 'complete'
            } else if (wizardStep.value === 'running') {
                wizardStep.value = 'preflight'
            }
        }
    }

    return reactive({
        form,
        tableFilter,
        showSelectedOnly,
        showAdvancedOptions,
        preflightStatusFilter,
        filteredPreflightTables,
        preflightScanSummary,
        truncateLockedByMode,
        modeDescriptionKey,
        canStartMigration,
        footerHint,
        tablesLoading,
        tablesLoadError,
        tablesListFooterLabel,
        formError,
        preflightLoading,
        preflightError,
        preflightResult,
        preflightStale,
        rowDiffLoading,
        rowDiffError,
        rowDiffResult,
        selectedPreflightTable,
        wizardStep,
        pausing,
        cancelling,
        canPauseMigration,
        canCancelMigration,
        running,
        progress,
        progressPercent,
        progressDetailLabel,
        runStartedAt,
        canResumeFromWizard,
        resuming,
        migrationResults,
        migrationRunLogs,
        migrationRunLogsFull,
        migrationRunLogsCompacted,
        migrationRunRecord,
        wizardSteps,
        source,
        filteredTables,
        allSelected,
        targetDatabases,
        targetConnectionLabel,
        completionSummary,
        completionStatusKey,
        selectedCountLabel,
        targetConnectionOptions,
        targetDatabaseOptions,
        targetMissingPolicyOptions,
        selectedPreflightDetail,
        suggestedOrderByOptions,
        recommendedWatermarkColumns,
        watermarkColumnSelectOptions,
        canCheck,
        canMigrate,
        migrateBlockedReason,
        migrateTablesCount,
        needsProductionApproval,
        migrateActionLabel,
        productionApprovalDialogOpen,
        productionApprovalSubmitting,
        productionApprovalError,
        productionApprovalSql,
        productionApprovalTeams,
        isFlowStepAccessible,
        isFlowStepCompleted,
        goToFlowStep,
        toggleTable,
        clearSelection,
        setPreflightStatusFilter,
        toggleOrderByColumn: (column: string, checked: boolean) => toggleOrderByColumn(form.value, column, checked),
        formatRowCount,
        formatIssue,
        formatStatus,
        formatMappingWarning,
        selectPreflightTable,
        copySuggestedDdl,
        formatValidation,
        goToPreflightStep,
        backToConfigureStep,
        startNewMigration,
        runPreflight,
        runRowDiff,
        formatDuration,
        formatLogLine,
        openMigrationTasksPanel,
        formatTimestamp,
        copyMigrationLog,
        downloadMigrationReport,
        startMigration,
        onSubmitProductionApproval,
        pauseActiveMigration,
        cancelActiveMigration,
        resumeFromCheckpoint,
    })
}
