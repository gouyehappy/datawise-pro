/** 后端 REST 路径集中定义，便于前后端对齐与维护 */

/** Empty / missing namespace → cluster-scoped `_all` (matches KubernetesRestClient). */
function k8sNamespaceSegment(namespace: string | null | undefined): string {
    const trimmed = namespace?.trim() ?? ''
    return encodeURIComponent(trimmed || '_all')
}

export const API_PATHS = {
    auth: {
        login: '/login',
        loginGuest: '/login/guest',
        signOut: '/signOut',
        register: '/api/auth/register',
        session: '/api/auth/session',
        switchTenant: '/api/auth/switch-tenant',
        sessionPolicy: '/api/auth/session-policy',
        changePassword: '/api/auth/change-password',
        verifyPassword: '/api/auth/verify-password',
        loginOptions: '/api/auth/login-options',
        oidcLogin: '/api/auth/oidc/login',
        oidcConfig: '/api/auth/oidc/config',
    },
    tenants: {
        mine: '/api/tenants/mine',
        aiUsage: '/api/tenants/mine/ai-usage',
        list: '/api/tenants',
        create: '/api/tenants',
        status: (tenantId: string) => `/api/tenants/${encodeURIComponent(tenantId)}/status`,
        members: (tenantId: string) => `/api/tenants/${encodeURIComponent(tenantId)}/members`,
        member: (tenantId: string, userId: number) =>
            `/api/tenants/${encodeURIComponent(tenantId)}/members/${userId}`,
    },
    projects: {
        list: '/api/projects',
        create: '/api/projects',
        active: '/api/projects/active',
        one: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`,
        files: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/files`,
        fileContent: (projectId: string) =>
            `/api/projects/${encodeURIComponent(projectId)}/files/content`,
        mkdir: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/files/mkdir`,
        rename: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/files/rename`,
        moveConnections: (projectId: string) =>
            `/api/projects/${encodeURIComponent(projectId)}/connections/move`,
        shareConnections: (projectId: string) =>
            `/api/projects/${encodeURIComponent(projectId)}/connections/share`,
        export: (projectId: string) =>
            `/api/projects/${encodeURIComponent(projectId)}/export`,
        import: '/api/projects/import',
    },
    shares: {
        list: '/api/shares',
        create: '/api/shares',
        revoke: (id: string) => `/api/shares/${encodeURIComponent(id)}`,
        publicJson: (token: string) => `/api/public/shares/${encodeURIComponent(token)}`,
        publicPage: (token: string) => `/share/${encodeURIComponent(token)}`,
    },
    admin: {
        users: '/api/admin/users',
        tenantRoles: '/api/admin/tenant-roles',
        tenantRole: (roleId: string) => `/api/admin/tenant-roles/${encodeURIComponent(roleId)}`,
        userPermissions: (userId: number) => `/api/admin/users/${userId}/permissions`,
        userRoles: (userId: number) => `/api/admin/users/${userId}/roles`,
    },
    sql: {
        execute: '/api/sql/execute',
        activeSessions: '/api/sql/active-sessions',
        lockWaits: '/api/sql/lock-waits',
        killSession: '/api/sql/kill-session',
        cancelExecution: '/api/sql/cancel-execution',
        sessionStatus: '/api/sql/session/status',
        sessionBegin: '/api/sql/session/begin',
        sessionAutocommit: '/api/sql/session/autocommit',
        sessionCommit: '/api/sql/session/commit',
        sessionRollback: '/api/sql/session/rollback',
        sessionClose: '/api/sql/session',
        closeCursor: '/api/sql/cursor',
    },
    ai: {
        chat: '/api/ai/chat',
        chatStream: '/api/ai/chat/stream',
        analyzeStream: '/api/ai/analyze/stream',
        analyzeResume: '/api/ai/analyze/resume',
        sqlGenerate: '/api/ai/sql/generate',
        testConnection: '/api/ai/test-connection',
        testEmbedding: '/api/ai/test-embedding',
        knowledge: '/api/ai/knowledge',
    },
    datagen: {
        tablePreview: '/api/datagen/table/preview',
        tableExecute: '/api/datagen/table/execute',
    },
    tableData: (
        tableName: string,
        options?: {
            connectionId?: string
            database?: string
            maxRows?: number
            cursorId?: string
            filter?: string
        },
    ) => {
        const base = `/api/tables/${encodeURIComponent(tableName)}/data`
        const params = new URLSearchParams()
        if (options?.connectionId) params.set('connectionId', options.connectionId)
        if (options?.database) params.set('database', options.database)
        if (options?.maxRows != null && options.maxRows > 0) params.set('maxRows', String(options.maxRows))
        if (options?.cursorId) params.set('cursorId', options.cursorId)
        if (options?.filter?.trim()) params.set('filter', options.filter.trim())
        const qs = params.toString()
        return qs ? `${base}?${qs}` : base
    },
    tableRows: (tableName: string) => `/api/tables/${encodeURIComponent(tableName)}/rows`,
    tableRowsDelete: (tableName: string) => `/api/tables/${encodeURIComponent(tableName)}/rows/delete`,
    tableRowsUpdate: (tableName: string) => `/api/tables/${encodeURIComponent(tableName)}/rows/update`,
    tableDataAudit: (
        tableName: string,
        options?: { connectionId?: string; database?: string; limit?: number },
    ) => {
        const base = `/api/tables/${encodeURIComponent(tableName)}/data/audit`
        const params = new URLSearchParams()
        if (options?.connectionId) params.set('connectionId', options.connectionId)
        if (options?.database) params.set('database', options.database)
        if (options?.limit != null && options.limit > 0) params.set('limit', String(options.limit))
        const qs = params.toString()
        return qs ? `${base}?${qs}` : base
    },
    tableDataAuditRestore: (tableName: string, auditId: string) =>
        `/api/tables/${encodeURIComponent(tableName)}/data/audit/${encodeURIComponent(auditId)}/restore`,
    tableProperties: (tableName: string, options?: { connectionId?: string; database?: string; kind?: 'table' | 'view' }) => {
        const base = `/api/tables/${encodeURIComponent(tableName)}/properties`
        const params = new URLSearchParams()
        if (options?.connectionId) params.set('connectionId', options.connectionId)
        if (options?.database) params.set('database', options.database)
        if (options?.kind && options.kind !== 'table') params.set('kind', options.kind)
        const qs = params.toString()
        return qs ? `${base}?${qs}` : base
    },
    tableDdl: (tableName: string, options?: { connectionId?: string; database?: string; kind?: 'table' | 'view' }) => {
        const base = `/api/tables/${encodeURIComponent(tableName)}/ddl`
        const params = new URLSearchParams()
        if (options?.connectionId) params.set('connectionId', options.connectionId)
        if (options?.database) params.set('database', options.database)
        if (options?.kind && options.kind !== 'table') params.set('kind', options.kind)
        const qs = params.toString()
        return qs ? `${base}?${qs}` : base
    },
    tableRelations: (tableName: string, options?: { connectionId?: string; database?: string }) => {
        const base = `/api/tables/${encodeURIComponent(tableName)}/relations`
        const params = new URLSearchParams()
        if (options?.connectionId) params.set('connectionId', options.connectionId)
        if (options?.database) params.set('database', options.database)
        const qs = params.toString()
        return qs ? `${base}?${qs}` : base
    },
    schemaRelations: (options?: { connectionId?: string; database?: string }) => {
        const base = '/api/schema/relations'
        const params = new URLSearchParams()
        if (options?.connectionId) params.set('connectionId', options.connectionId)
        if (options?.database) params.set('database', options.database)
        const qs = params.toString()
        return qs ? `${base}?${qs}` : base
    },
    schemaTables: (options?: { connectionId?: string; database?: string }) => {
        const base = '/api/schema/tables'
        const params = new URLSearchParams()
        if (options?.connectionId) params.set('connectionId', options.connectionId)
        if (options?.database) params.set('database', options.database)
        const qs = params.toString()
        return qs ? `${base}?${qs}` : base
    },
    tableExportSql: (
        tableName: string,
        options?: { connectionId?: string; database?: string; includeData?: boolean; maxRows?: number },
    ) => {
        const base = `/api/tables/${encodeURIComponent(tableName)}/export-sql`
        const params = new URLSearchParams()
        if (options?.connectionId) params.set('connectionId', options.connectionId)
        if (options?.database) params.set('database', options.database)
        if (options?.includeData) params.set('includeData', 'true')
        if (options?.maxRows != null && options.maxRows > 0) params.set('maxRows', String(options.maxRows))
        const qs = params.toString()
        return qs ? `${base}?${qs}` : base
    },
    databaseExportSql: (options?: {
        connectionId?: string
        database?: string
        includeData?: boolean
        maxRows?: number
    }) => {
        const base = '/api/export-sql/database'
        const params = new URLSearchParams()
        if (options?.connectionId) params.set('connectionId', options.connectionId)
        if (options?.database) params.set('database', options.database)
        if (options?.includeData) params.set('includeData', 'true')
        if (options?.maxRows != null && options.maxRows > 0) params.set('maxRows', String(options.maxRows))
        const qs = params.toString()
        return qs ? `${base}?${qs}` : base
    },
    databaseMetadocPreview: (options?: {
        connectionId?: string
        database?: string
        format?: string
        includeDetails?: boolean
    }) => {
        const base = '/api/export-metadoc/database/preview'
        const params = new URLSearchParams()
        if (options?.connectionId) params.set('connectionId', options.connectionId)
        if (options?.database) params.set('database', options.database)
        if (options?.format) params.set('format', options.format)
        if (options?.includeDetails != null) params.set('includeDetails', String(options.includeDetails))
        const qs = params.toString()
        return qs ? `${base}?${qs}` : base
    },
    migration: {
        table: '/api/migration/table',
        batch: '/api/migration/batch',
        tablesBatch: '/api/migration/tables/batch',
        tablesBatchStream: '/api/migration/tables/batch/stream',
        preflight: '/api/migration/preflight',
        rowDiff: '/api/migration/row-diff',
        jobs: '/api/migration/jobs',
        job: (id: string) => `/api/migration/jobs/${encodeURIComponent(id)}`,
        jobPause: (id: string) => `/api/migration/jobs/${encodeURIComponent(id)}/pause`,
        jobCancel: (id: string) => `/api/migration/jobs/${encodeURIComponent(id)}/cancel`,
        jobResume: (id: string) => `/api/migration/jobs/${encodeURIComponent(id)}/resume`,
        jobStream: (id: string) => `/api/migration/jobs/${encodeURIComponent(id)}/stream`,
    },
    backup: {
        policies: '/api/backup/policies',
        policy: (id: string) => `/api/backup/policies/${encodeURIComponent(id)}`,
        policyRun: (id: string) => `/api/backup/policies/${encodeURIComponent(id)}/run`,
        runs: '/api/backup/runs',
        run: (id: string) => `/api/backup/runs/${encodeURIComponent(id)}`,
        runCancel: (id: string) => `/api/backup/runs/${encodeURIComponent(id)}/cancel`,
        artifacts: '/api/backup/artifacts',
        artifact: (id: string) => `/api/backup/artifacts/${encodeURIComponent(id)}`,
        artifactStats: (id: string) => `/api/backup/artifacts/${encodeURIComponent(id)}/stats`,
        restorePreflight: '/api/backup/restore/preflight',
        restoreJobs: '/api/backup/restore/jobs',
        restoreJob: (id: string) => `/api/backup/restore/jobs/${encodeURIComponent(id)}`,
        restoreJobCancel: (id: string) => `/api/backup/restore/jobs/${encodeURIComponent(id)}/cancel`,
        health: '/api/backup/health',
    },
    connection: {
        test: '/api/connections/test',
    },
    terminal: {
        execute: '/api/terminal/execute',
        welcome: '/api/terminal/welcome',
        status: '/api/terminal/status',
    },
    explorer: {
        tree: '/api/explorer/tree',
        groups: '/api/explorer/groups',
        group: (id: string) => `/api/explorer/groups/${encodeURIComponent(id)}`,
        connections: '/api/explorer/connections',
        connection: (id: string) => `/api/explorer/connections/${encodeURIComponent(id)}`,
        connectionGroup: (id: string) =>
            `/api/explorer/connections/${encodeURIComponent(id)}/group`,
        reorder: '/api/explorer/reorder',
        connectConnection: (id: string) =>
            `/api/explorer/connections/${encodeURIComponent(id)}/connect`,
        disconnectConnection: (id: string) =>
            `/api/explorer/connections/${encodeURIComponent(id)}/disconnect`,
        reconnectConnection: (id: string) =>
            `/api/explorer/connections/${encodeURIComponent(id)}/reconnect`,
        pooledConnections: '/api/explorer/connections/pooled',
        pingConnection: (id: string) =>
            `/api/explorer/connections/${encodeURIComponent(id)}/ping`,
        touchConnection: (id: string) =>
            `/api/explorer/connections/${encodeURIComponent(id)}/touch`,
        nodeChildren: (connectionId: string, nodeId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/nodes/${encodeURIComponent(nodeId)}/children`,
        importConnections: '/api/explorer/connections/import',
        node: (id: string) => `/api/explorer/nodes/${encodeURIComponent(id)}`,
        redisKey: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/redis/key`,
        redisKeys: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/redis/keys`,
        redisCommand: (connectionId: string, database?: number) => {
            const base = `/api/explorer/connections/${encodeURIComponent(connectionId)}/redis/command`
            if (database == null) return base
            return `${base}?database=${encodeURIComponent(String(database))}`
        },
        elasticsearchIndices: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/elasticsearch/indices`,
        elasticsearchIndexMetadata: (connectionId: string, index: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/elasticsearch/indices/${encodeURIComponent(index)}/metadata`,
        elasticsearchRest: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/elasticsearch/rest`,
        elasticsearchClearIndex: (connectionId: string, index: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/elasticsearch/indices/${encodeURIComponent(index)}/clear`,
        elasticsearchDocuments: (connectionId: string, index: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/elasticsearch/indices/${encodeURIComponent(index)}/documents`,
        elasticsearchDocumentCount: (connectionId: string, index: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/elasticsearch/indices/${encodeURIComponent(index)}/count`,
        elasticsearchDocument: (connectionId: string, index: string, id: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/elasticsearch/indices/${encodeURIComponent(index)}/documents/${encodeURIComponent(id)}`,
        kafkaTopics: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/topics`,
        kafkaCluster: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/cluster`,
        kafkaTopic: (connectionId: string, topic: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/topics/${encodeURIComponent(topic)}`,
        kafkaTopicPartitions: (connectionId: string, topic: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/topics/${encodeURIComponent(topic)}/partitions`,
        kafkaTopicConfigs: (connectionId: string, topic: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/topics/${encodeURIComponent(topic)}/configs`,
        kafkaMessages: (connectionId: string, topic: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/topics/${encodeURIComponent(topic)}/messages`,
        kafkaProduce: (connectionId: string, topic: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/topics/${encodeURIComponent(topic)}/messages`,
        kafkaPublishTable: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/publish-table`,
        kafkaConsumerGroups: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/consumer-groups`,
        kafkaConsumerGroupMetrics: (connectionId: string, groupId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/consumer-groups/${encodeURIComponent(groupId)}/metrics`,
        kafkaConsumerGroupResetOffsets: (connectionId: string, groupId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/kafka/consumer-groups/${encodeURIComponent(groupId)}/reset-offsets`,
        yarnInfo: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/yarn/info`,
        yarnApps: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/yarn/apps`,
        yarnApp: (connectionId: string, appId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/yarn/apps/${encodeURIComponent(appId)}`,
        yarnNodes: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/yarn/nodes`,
        yarnQueues: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/yarn/queues`,
        yarnKillApp: (connectionId: string, appId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/yarn/apps/${encodeURIComponent(appId)}/state`,
        yarnMoveAppQueue: (connectionId: string, appId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/yarn/apps/${encodeURIComponent(appId)}/queue`,
        yarnRemoveQueue: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/yarn/queues/remove`,
        jenkinsInfo: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/jenkins/info`,
        jenkinsViews: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/jenkins/views`,
        jenkinsJobs: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/jenkins/jobs`,
        jenkinsJob: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/jenkins/job`,
        jenkinsJobBuild: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/jenkins/job/build`,
        jenkinsJobStopBuild: (connectionId: string, buildNumber: number | string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/jenkins/job/builds/${encodeURIComponent(String(buildNumber))}/stop`,
        jenkinsJobBuildLog: (connectionId: string, buildNumber: number | string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/jenkins/job/builds/${encodeURIComponent(String(buildNumber))}/log`,
        jenkinsQueue: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/jenkins/queue`,
        jenkinsNodes: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/jenkins/nodes`,
        nacosInfo: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/nacos/info`,
        nacosNamespaces: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/nacos/namespaces`,
        nacosNamespacesDetect: () => '/api/explorer/nacos/namespaces/detect',
        nacosConfigs: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/nacos/configs`,
        nacosConfig: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/nacos/config`,
        nacosServices: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/nacos/services`,
        nacosInstances: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/nacos/instances`,
        polarisInfo: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/polaris/info`,
        polarisNamespaces: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/polaris/namespaces`,
        polarisServices: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/polaris/services`,
        polarisInstances: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/polaris/instances`,
        polarisConfigs: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/polaris/configs`,
        polarisConfig: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/polaris/config`,
        k8sInfo: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/info`,
        k8sNamespaces: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces`,
        k8sPods: (connectionId: string, namespace: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces/${k8sNamespaceSegment(namespace)}/pods`,
        k8sPod: (connectionId: string, namespace: string, podName: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces/${k8sNamespaceSegment(namespace)}/pods/${encodeURIComponent(podName)}`,
        k8sPodLogs: (connectionId: string, namespace: string, podName: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces/${k8sNamespaceSegment(namespace)}/pods/${encodeURIComponent(podName)}/logs`,
        k8sDeployments: (connectionId: string, namespace: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces/${k8sNamespaceSegment(namespace)}/deployments`,
        k8sServices: (connectionId: string, namespace: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces/${k8sNamespaceSegment(namespace)}/services`,
        k8sConfigMaps: (connectionId: string, namespace: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces/${k8sNamespaceSegment(namespace)}/configmaps`,
        k8sSecrets: (connectionId: string, namespace: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces/${k8sNamespaceSegment(namespace)}/secrets`,
        k8sEvents: (connectionId: string, namespace: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces/${k8sNamespaceSegment(namespace)}/events`,
        k8sCrds: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/crds`,
        k8sHelmReleases: (connectionId: string, namespace: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces/${k8sNamespaceSegment(namespace)}/helm/releases`,
        k8sApply: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/apply`,
        k8sRestartDeployment: (connectionId: string, namespace: string, deploymentName: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/k8s/namespaces/${k8sNamespaceSegment(namespace)}/deployments/${encodeURIComponent(deploymentName)}/restart`,
        createDatabase: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/databases`,
        deleteDatabase: (connectionId: string, name: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/databases/${encodeURIComponent(name)}`,
        createSchema: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/schemas`,
        mysqlCharsets: (connectionId: string) =>
            `/api/explorer/connections/${encodeURIComponent(connectionId)}/mysql/charsets`,
    },
    workspace: {
        sqlLogs: '/api/workspace/sql-logs',
        sqlStats: '/api/workspace/sql-stats',
        savedConsoles: '/api/workspace/saved-consoles',
        instanceSql: '/api/workspace/instance-sql',
        instanceSqlScripts: '/api/workspace/instance-sql/scripts',
        instanceSqlRename: '/api/workspace/instance-sql/rename',
        instanceSqlLatest: '/api/workspace/instance-sql/latest',
        instanceSqlHistory: '/api/workspace/instance-sql/history',
        instanceSqlHistoryVersion: '/api/workspace/instance-sql/history/version',
        instanceSqlHistoryRestore: '/api/workspace/instance-sql/history/restore',
        viewModels: '/api/workspace/view-models',
        viewModelsDraft: '/api/workspace/view-models/draft',
        viewModelsScripts: '/api/workspace/view-models/scripts',
        viewModelsRename: '/api/workspace/view-models/rename',
        settings: '/api/workspace/settings',
        exportTasks: '/api/workspace/export-tasks',
    },
    notifications: {
        list: '/api/notifications',
        readAll: '/api/notifications/read-all',
        read: (id: string) => `/api/notifications/${encodeURIComponent(id)}/read`,
        item: (id: string) => `/api/notifications/${encodeURIComponent(id)}`,
        clearRead: '/api/notifications/clear-read',
        clearAll: '/api/notifications?all=true',
    },
    plugins: '/api/plugins',
    communityPlugins: {
        list: '/api/community-plugins',
        detail: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}`,
        install: '/api/community-plugins/install',
        installUpload: '/api/community-plugins/install-upload',
        installUrl: '/api/community-plugins/install-url',
        marketplaceCatalogs: '/api/community-plugins/marketplace/catalogs',
        marketplaceInstall: '/api/community-plugins/marketplace/install',
        trustKeys: '/api/community-plugins/trust/keys',
        repositories: '/api/community-plugins/repositories',
        rollback: '/api/community-plugins/rollback',
        uninstall: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}`,
        activate: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}/activate`,
        stop: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}/stop`,
        storage: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}/storage`,
        invoke: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}/invoke`,
        sqlConnections: (pluginId: string) =>
            `/api/community-plugins/${encodeURIComponent(pluginId)}/sql/connections`,
        sqlExecute: (pluginId: string) =>
            `/api/community-plugins/${encodeURIComponent(pluginId)}/sql/execute`,
        aiStatus: (pluginId: string) =>
            `/api/community-plugins/${encodeURIComponent(pluginId)}/ai/status`,
        aiChat: (pluginId: string) =>
            `/api/community-plugins/${encodeURIComponent(pluginId)}/ai/chat`,
        aiChatStream: (pluginId: string) =>
            `/api/community-plugins/${encodeURIComponent(pluginId)}/ai/chat/stream`,
        notify: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}/notify`,
        connectionTest: '/api/community-plugins/connection/test',
        connectionConnect: '/api/community-plugins/connection/connect',
        connectionDisconnect: '/api/community-plugins/connection/disconnect',
        connectionAction: '/api/community-plugins/connection/action',
        filesystemList: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}/filesystem/list`,
        filesystemRead: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}/filesystem/read`,
        filesystemWrite: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}/filesystem/write`,
        filesystemDelete: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}/filesystem/delete`,
        filesystemRename: (pluginId: string) => `/api/community-plugins/${encodeURIComponent(pluginId)}/filesystem/rename`,
        filesystemCreateDirectory: (pluginId: string) =>
            `/api/community-plugins/${encodeURIComponent(pluginId)}/filesystem/createDirectory`,
        ui: (pluginId: string, path = '') =>
            `/api/community-plugins/${encodeURIComponent(pluginId)}/ui/${path.replace(/^\/+/, '')}`,
        packageAsset: (pluginId: string, path = 'assets/plugin.svg') =>
            `/api/community-plugins/${encodeURIComponent(pluginId)}/package/${path
                .replace(/\\/g, '/')
                .replace(/^\/+/, '')
                .split('/')
                .map((segment) => encodeURIComponent(segment))
                .join('/')}`,
        uiTicket: (pluginId: string) =>
            `/api/community-plugins/${encodeURIComponent(pluginId)}/ui-ticket`,
        streamWs: '/ws/community-plugin-stream',
    },
    packs: {
        entitlement: '/api/packs/entitlement',
        catalog: '/api/packs/catalog',
        activate: '/api/packs/entitlement/activate',
        trial: '/api/packs/entitlement/trial',
        siteProTrial: '/api/packs/entitlement/trial/site-pro',
        install: '/api/packs/install',
        installDpk: '/api/packs/install-dpk',
        uninstall: (packId: string) => `/api/packs/${encodeURIComponent(packId)}`,
        audit: '/api/packs/audit',
    },
    datasources: {
        list: '/api/datasources',
        market: '/api/datasources/market',
        explorerUi: '/api/datasources/explorer-ui',
        marketInstall: '/api/datasources/market/install',
        marketInstallBatch: '/api/datasources/market/install-batch',
        marketUninstall: (connectorId: string) =>
            `/api/datasources/market/${encodeURIComponent(connectorId)}`,
        marketCleanupRedundant: '/api/datasources/market/cleanup-redundant',
        pluginsStatus: '/api/datasources/plugins/status',
        pluginsReload: '/api/datasources/plugins/reload',
        pluginsQuarantineClear: '/api/datasources/plugins/quarantine/clear',
        drivers: '/api/datasources/drivers',
        driversProgress: (maven: string) =>
            `/api/datasources/drivers/progress?maven=${encodeURIComponent(maven)}`,
        driversInstall: '/api/datasources/drivers/install',
        resolveDriver: '/api/datasources/drivers/resolve',
        deleteDriver: (relativePath: string) =>
            `/api/datasources/drivers?path=${encodeURIComponent(relativePath)}`,
        deleteDriverBundle: (bundleDir: string) =>
            `/api/datasources/drivers/bundles/${encodeURIComponent(bundleDir)}`,
        deleteDriverFamily: (familyId: string) =>
            `/api/datasources/drivers/families/${encodeURIComponent(familyId)}`,
    },
    runtime: '/api/runtime',
    runtimeJre: '/api/runtime/jre',
    runtimeImport: '/api/runtime/import',
    health: '/api/health',
    metrics: '/api/system/metrics',
    deploymentProfile: '/api/system/deployment-profile',
    configMigration: '/api/system/config-migration',
    configMigrationApply: '/api/system/config-migration/apply',
    secrets: '/api/system/secrets',
    lineage: {
        viewModels: '/api/lineage/view-models',
        parse: '/api/lineage/view-models/parse',
        impact: '/api/lineage/view-models/impact',
    },
    config: {
        app: '/api/config/app',
        appXml: '/api/config/app.xml',
        workspaceSession: '/api/config/workspace-session',
        aiPreferences: '/api/config/ai-preferences',
        explorerUi: '/api/config/explorer-ui',
        window: '/api/config/window',
        localFiles: '/api/config/local-files',
        sqlSnippets: (layer: 'shared' | 'personal') =>
            `/api/config/sql-snippets/${layer}`,
        updater: '/api/config/updater',
        connections: '/api/config/connections',
        connectionsXml: '/api/config/connections.xml',
        portability: {
            export: '/api/config/portability/export',
            importPreflight: '/api/config/portability/import/preflight',
            import: '/api/config/portability/import',
        },
    },
    teams: {
        list: '/api/teams',
        create: '/api/teams',
        join: '/api/teams/join',
        joinRequests: '/api/teams/join-requests',
        members: (teamId: string) => `/api/teams/${encodeURIComponent(teamId)}/members`,
        memberRole: (teamId: string, userId: number) =>
            `/api/teams/${encodeURIComponent(teamId)}/members/${userId}/role`,
        invites: (teamId: string) => `/api/teams/${encodeURIComponent(teamId)}/invites`,
        approveInvite: (teamId: string, inviteId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/invites/${encodeURIComponent(inviteId)}/approve`,
        rejectInvite: (teamId: string, inviteId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/invites/${encodeURIComponent(inviteId)}/reject`,
        settings: (teamId: string) => `/api/teams/${encodeURIComponent(teamId)}/settings`,
        auditLogs: (teamId: string) => `/api/teams/${encodeURIComponent(teamId)}/audit-logs`,
        auditLogsExport: (teamId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/audit-logs/export`,
        sharedConnections: (teamId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/shared-connections`,
        onCallConnections: (teamId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/on-call-connections`,
        sharedConsoles: (teamId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/shared-consoles`,
        visibleProjects: (teamId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/visible-projects`,
        shareSqlHistory: (teamId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/share-sql-history`,
        aiSessions: (teamId: string) => `/api/teams/${encodeURIComponent(teamId)}/ai-sessions`,
        aiSession: (teamId: string, sessionId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/ai-sessions/${encodeURIComponent(sessionId)}`,
        sharedQueries: (teamId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/shared-queries`,
        sharedQuery: (teamId: string, queryId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/shared-queries/${encodeURIComponent(queryId)}`,
        sharedQueryStream: (teamId: string, queryId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/shared-queries/${encodeURIComponent(queryId)}/stream`,
        sharedQueryComment: (teamId: string, queryId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/shared-queries/${encodeURIComponent(queryId)}/comments`,
        sharedQueryCommentById: (teamId: string, queryId: string, commentId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/shared-queries/${encodeURIComponent(queryId)}/comments/${encodeURIComponent(commentId)}`,
        sharedQueryFavorite: (teamId: string, queryId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/shared-queries/${encodeURIComponent(queryId)}/favorite`,
        productionApprovals: (teamId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/production-approvals`,
        productionApproval: (teamId: string, approvalId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/production-approvals/${encodeURIComponent(approvalId)}`,
        productionApprovalApprove: (teamId: string, approvalId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/production-approvals/${encodeURIComponent(approvalId)}/approve`,
        productionApprovalReject: (teamId: string, approvalId: string) =>
            `/api/teams/${encodeURIComponent(teamId)}/production-approvals/${encodeURIComponent(approvalId)}/reject`,
    },
    aiRag: {
        status: '/api/ai/rag/status',
        rebuild: '/api/ai/rag/rebuild',
    },
    aiPython: {
        runtime: '/api/ai/python/runtime',
    },
    aiSchema: {
        tables: '/api/ai/schema/tables',
    },
    aiTableTags: {
        list: '/api/ai/table-tags',
        catalog: '/api/ai/table-tags/catalog',
    },
    platform: {
        analysisCanvas: '/api/platform/analysis-canvas',
        analysisCanvasRerun: '/api/platform/analysis-canvas/rerun',
        semanticMetrics: '/api/platform/semantic-metrics',
        semanticMetricsAutoGenerate: '/api/platform/semantic-metrics/auto-generate',
        discoverySearch: '/api/discovery/search',
        sqlReview: '/api/platform/sql-review',
        federatedViews: '/api/platform/federated-views',
        federatedViewsExecute: '/api/platform/federated-views/execute',
        federatedViewsGenerateSql: '/api/platform/federated-views/generate-sql',
        federatedViewsAnalyzeRisk: '/api/platform/federated-views/analyze-risk',
        schemaDriftMonitors: '/api/platform/schema-drift/monitors',
        schemaDriftCompare: '/api/platform/schema-drift/compare',
        schemaDriftMonitorRun: (id: string) =>
            `/api/platform/schema-drift/monitors/${encodeURIComponent(id)}/run`,
        scheduledTasks: '/api/platform/scheduled-tasks',
        scheduledTaskRun: (id: string) =>
            `/api/platform/scheduled-tasks/${encodeURIComponent(id)}/run`,
        dataQualityRules: '/api/platform/data-quality/rules',
        dataQualityGate: '/api/platform/data-quality/gate',
        dataQualityTemplates: '/api/platform/data-quality/templates',
        dataQualityTemplate: (id: string) =>
            `/api/platform/data-quality/templates/${encodeURIComponent(id)}`,
        orchestrationTrigger: '/api/platform/orchestration/trigger',
        orchestrationStatus: '/api/platform/orchestration/status',
        insightActions: '/api/platform/insight-actions',
        outboundWebhooks: '/api/platform/outbound-webhooks',
        outboundWebhookSchema: '/api/platform/outbound-webhooks/schema',
        outboundWebhookTest: (id: string) =>
            `/api/platform/outbound-webhooks/${encodeURIComponent(id)}/test`,
        queryLibraryVersions: (teamId: string, queryId: string) =>
            `/api/platform/query-library/${encodeURIComponent(teamId)}/${encodeURIComponent(queryId)}/versions`,
        queryLibrarySaveVersion: '/api/platform/query-library/versions',
        workbenchContext: '/api/platform/workbench-context',
        workbenchContextHeartbeat: '/api/platform/workbench-context/heartbeat',
        mcpConfirmations: '/api/platform/mcp/confirmations',
        mcpConfirmation: (id: string) =>
            `/api/platform/mcp/confirmations/${encodeURIComponent(id)}`,
        mcpConfirmationDecide: (id: string) =>
            `/api/platform/mcp/confirmations/${encodeURIComponent(id)}/decide`,
    },
    ssh: {
        scriptRecords: (connectionId: string) =>
            `/api/ssh/script-records?connectionId=${encodeURIComponent(connectionId)}`,
        scriptRecordsSave: '/api/ssh/script-records',
        scriptRecordDelete: (connectionId: string, recordId: string) =>
            `/api/ssh/script-records/${encodeURIComponent(recordId)}?connectionId=${encodeURIComponent(connectionId)}`,
    },
} as const
