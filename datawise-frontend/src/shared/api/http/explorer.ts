import type {
    ExplorerApi,
    ExplorerConnectionResult,
    ExplorerGroupResult,
    ExplorerImportResult,
    ExplorerLoadChildrenResult,
    ConnectionTestResult,
    CreateNamespaceResult,
} from '@/shared/api/types'
import type {ConnectionConfig, TreeNode} from '@/core/types'
import type {ApiResponse} from '@/shared/api/types'
import type {
    ConnectionResultDto,
    ConnectionTestResult as WireConnectionTestResult,
    CreateNamespaceResultDto,
    GroupResultDto,
    ImportConnectionsResultDto,
    KafkaTopicsResultDto,
    TreePayloadDto,
    YarnMutationResultDto,
} from '@/shared/api/generated'
import type {KafkaTopicsResult, YarnMutationResult} from '@/shared/api/explorer-ops.types'
import {
    buildSessionHeaders,
    deleteJson,
    getJson,
    postJson,
    putJson,
    requireBaseUrl,
} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

function sessionHeaders(extra?: Record<string, string>): Record<string, string> {
    return buildSessionHeaders(extra)
}

/** OpenAPI TreeNode omits runtime fields (children, …); preserve wire payload as app TreeNode. */
function mapTreeNodes(wire: TreePayloadDto['tree']): TreeNode[] {
    return (wire ?? []) as TreeNode[]
}

function mapTreePayload(wire: TreePayloadDto): ExplorerLoadChildrenResult {
    return {
        tree: mapTreeNodes(wire.tree),
        hasMore: wire.hasMore ?? undefined,
        nextOffset: wire.nextOffset ?? undefined,
        etag: wire.etag ?? null,
    }
}

function mapTestResult(wire: WireConnectionTestResult): ConnectionTestResult {
    return {
        ok: Boolean(wire.ok),
        message: String(wire.message ?? ''),
        latencyMs: Number(wire.latencyMs ?? 0),
    }
}

function mapGroupResult(wire: GroupResultDto): ExplorerGroupResult {
    return {
        groupId: String(wire.groupId ?? ''),
        tree: mapTreeNodes(wire.tree),
    }
}

function mapConnectionResult(wire: ConnectionResultDto): ExplorerConnectionResult {
    return {
        connectionId: String(wire.connectionId ?? ''),
        tree: mapTreeNodes(wire.tree),
    }
}

function mapImportResult(wire: ImportConnectionsResultDto): ExplorerImportResult {
    return {
        count: Number(wire.count ?? 0),
        tree: mapTreeNodes(wire.tree),
    }
}

function mapCreateNamespace(wire: CreateNamespaceResultDto): CreateNamespaceResult {
    return {
        name: String(wire.name ?? ''),
        kind: String(wire.kind ?? ''),
        sql: String(wire.sql ?? ''),
        created: Boolean(wire.created),
    }
}

function mapYarnMutation(wire: YarnMutationResultDto): YarnMutationResult {
    return {
        success: Boolean(wire.success),
        message: wire.message ?? null,
        state: wire.state ?? null,
    }
}

function mapKafkaTopics(wire: KafkaTopicsResultDto): KafkaTopicsResult {
    return {
        topics: [...(wire.topics ?? [])],
        totalCount: Number(wire.totalCount ?? 0),
    }
}

async function getExplorerChildren(
    path: string,
    query?: Record<string, string | undefined>,
    options?: { silent?: boolean; ifNoneMatch?: string },
): Promise<ExplorerLoadChildrenResult> {
    const params = new URLSearchParams()
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== '') {
                params.set(key, value)
            }
        }
    }
    const qs = params.toString()
    const baseUrl = requireBaseUrl()
    let url = baseUrl ? `${baseUrl}${path}` : path
    if (qs) {
        url += path.includes('?') ? `&${qs}` : `?${qs}`
    }
    const headers = sessionHeaders(
        options?.ifNoneMatch ? {'If-None-Match': options.ifNoneMatch} : undefined,
    )
    const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
        signal: AbortSignal.timeout(60_000),
    })
    if (response.status === 304) {
        const responseEtag = response.headers.get('etag')
        return {
            tree: [],
            unchanged: true,
            etag: responseEtag ?? options?.ifNoneMatch ?? null,
        }
    }
    let payload: ApiResponse<TreePayloadDto>
    try {
        payload = (await response.json()) as typeof payload
    } catch {
        throw new Error('HTTP API request failed.')
    }
    if (!response.ok || payload.code !== 0) {
        throw new Error(payload.msg?.trim() || `HTTP ${response.status}`)
    }
    const mapped = mapTreePayload(payload.data ?? {})
    return {
        ...mapped,
        etag: response.headers.get('etag') ?? mapped.etag ?? null,
    }
}

export function createHttpExplorerApi(): ExplorerApi {
    return {
        fetchTree: async (options) => {
            const data = await getJson<TreePayloadDto>(API_PATHS.explorer.tree, {
                refresh: options?.refresh ? 'true' : undefined,
            })
            return mapTreeNodes(data.tree)
        },

        loadChildren: async (connectionId, nodeId, options) => {
            const params: Record<string, string | undefined> = {}
            if (options?.pattern) {
                params.pattern = options.pattern
            }
            if (options?.refresh) {
                params.refresh = 'true'
            }
            if (options?.offset != null) {
                params.offset = String(options.offset)
            }
            if (options?.limit != null) {
                params.limit = String(options.limit)
            }
            if (options?.skeleton === false) {
                params.skeleton = 'false'
            }
            return getExplorerChildren(
                API_PATHS.explorer.nodeChildren(connectionId, nodeId),
                params,
                {silent: options?.silent, ifNoneMatch: options?.ifNoneMatch},
            )
        },

        fetchRedisKey: async (connectionId, key, options) =>
            getJson(API_PATHS.explorer.redisKey(connectionId), {
                key,
                database: options?.database != null ? String(options.database) : undefined,
            }),

        fetchRedisKeysScan: async (connectionId, options) =>
            getJson(API_PATHS.explorer.redisKeys(connectionId), {
                pattern: options?.pattern,
                cursor: options?.cursor,
                count: options?.count != null ? String(options.count) : undefined,
                database: options?.database != null ? String(options.database) : undefined,
            }),

        executeRedisCommand: async (connectionId, command, options) =>
            postJson(
                API_PATHS.explorer.redisCommand(connectionId, options?.database),
                {command},
            ),

        fetchElasticsearchIndices: async (connectionId) =>
            getJson(API_PATHS.explorer.elasticsearchIndices(connectionId)),

        fetchElasticsearchIndexMetadata: async (connectionId, index, options) =>
            getJson(API_PATHS.explorer.elasticsearchIndexMetadata(connectionId, index), {
                kind: options?.kind,
            }),

        executeElasticsearchRest: async (connectionId, requestText) =>
            postJson(API_PATHS.explorer.elasticsearchRest(connectionId), {requestText}),

        clearElasticsearchIndex: async (connectionId, index) =>
            postJson(API_PATHS.explorer.elasticsearchClearIndex(connectionId, index), {}),

        fetchElasticsearchDocuments: async (connectionId, index, options) =>
            getJson(API_PATHS.explorer.elasticsearchDocuments(connectionId, index), {
                offset: options?.offset != null ? String(options.offset) : undefined,
                limit: options?.limit != null ? String(options.limit) : undefined,
                filter: options?.filter,
            }),

        countElasticsearchDocuments: async (connectionId, index, options) =>
            getJson(API_PATHS.explorer.elasticsearchDocumentCount(connectionId, index), {
                filter: options?.filter,
            }),

        fetchElasticsearchDocument: async (connectionId, index, id) =>
            getJson(API_PATHS.explorer.elasticsearchDocument(connectionId, index, id)),

        upsertElasticsearchDocument: async (connectionId, index, payload) => {
            if (payload.id) {
                return putJson(
                    API_PATHS.explorer.elasticsearchDocument(connectionId, index, payload.id),
                    {id: payload.id, sourceJson: payload.sourceJson, routing: payload.routing},
                )
            }
            return postJson(API_PATHS.explorer.elasticsearchDocuments(connectionId, index), {
                id: payload.id,
                sourceJson: payload.sourceJson,
                routing: payload.routing,
            })
        },

        deleteElasticsearchDocument: async (connectionId, index, id, options) => {
            let path = API_PATHS.explorer.elasticsearchDocument(connectionId, index, id)
            if (options?.routing) {
                path += `?routing=${encodeURIComponent(options.routing)}`
            }
            return deleteJson(path)
        },

        fetchKafkaTopics: async (connectionId, options) =>
            mapKafkaTopics(
                await getJson<KafkaTopicsResultDto>(API_PATHS.explorer.kafkaTopics(connectionId), {
                    pattern: options?.pattern,
                    limit: options?.limit != null ? String(options.limit) : undefined,
                }),
            ),

        fetchKafkaClusterInfo: async (connectionId) =>
            getJson(API_PATHS.explorer.kafkaCluster(connectionId)),

        createKafkaTopic: async (connectionId, payload) =>
            postJson(API_PATHS.explorer.kafkaTopics(connectionId), payload),

        fetchKafkaTopicDetail: async (connectionId, topic) =>
            getJson(API_PATHS.explorer.kafkaTopic(connectionId, topic)),

        deleteKafkaTopic: async (connectionId, topic) =>
            deleteJson(API_PATHS.explorer.kafkaTopic(connectionId, topic)),

        increaseKafkaTopicPartitions: async (connectionId, topic, partitions) =>
            putJson(API_PATHS.explorer.kafkaTopicPartitions(connectionId, topic), {partitions}),

        fetchKafkaTopicConfigs: async (connectionId, topic) =>
            getJson(API_PATHS.explorer.kafkaTopicConfigs(connectionId, topic)),

        updateKafkaTopicConfigs: async (connectionId, topic, payload) =>
            putJson(API_PATHS.explorer.kafkaTopicConfigs(connectionId, topic), payload),

        fetchKafkaMessages: async (connectionId, topic, options) =>
            getJson(API_PATHS.explorer.kafkaMessages(connectionId, topic), {
                partition: options?.partition != null ? String(options.partition) : undefined,
                offset: options?.offset != null ? String(options.offset) : undefined,
                limit: options?.limit != null ? String(options.limit) : undefined,
                fromBeginning: options?.fromBeginning ? 'true' : undefined,
            }),

        produceKafkaMessage: async (connectionId, topic, payload) =>
            postJson(API_PATHS.explorer.kafkaProduce(connectionId, topic), payload),

        publishTableToKafka: async (connectionId, payload, options) =>
            postJson(API_PATHS.explorer.kafkaPublishTable(connectionId), payload, options),

        fetchKafkaConsumerGroups: async (connectionId, options) =>
            getJson(API_PATHS.explorer.kafkaConsumerGroups(connectionId), {
                pattern: options?.pattern,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchKafkaConsumerGroupMetrics: async (connectionId, groupId, options) =>
            getJson(API_PATHS.explorer.kafkaConsumerGroupMetrics(connectionId, groupId), {
                topic: options?.topic,
            }),

        resetKafkaConsumerGroupOffsets: async (connectionId, groupId, payload) =>
            postJson(API_PATHS.explorer.kafkaConsumerGroupResetOffsets(connectionId, groupId), payload),

        fetchYarnClusterInfo: async (connectionId) =>
            getJson(API_PATHS.explorer.yarnInfo(connectionId)),

        fetchYarnApplications: async (connectionId, options) =>
            getJson(API_PATHS.explorer.yarnApps(connectionId), {
                state: options?.state,
                user: options?.user,
                queue: options?.queue,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchYarnApplicationDetail: async (connectionId, appId) =>
            getJson(API_PATHS.explorer.yarnApp(connectionId, appId)),

        fetchYarnNodes: async (connectionId, options) =>
            getJson(API_PATHS.explorer.yarnNodes(connectionId), {
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchYarnQueues: async (connectionId) =>
            getJson(API_PATHS.explorer.yarnQueues(connectionId)),

        killYarnApplication: async (connectionId, appId, payload) =>
            mapYarnMutation(
                await putJson<YarnMutationResultDto>(
                    API_PATHS.explorer.yarnKillApp(connectionId, appId),
                    payload ?? {},
                ),
            ),

        moveYarnApplicationQueue: async (connectionId, appId, payload) =>
            mapYarnMutation(
                await putJson<YarnMutationResultDto>(
                    API_PATHS.explorer.yarnMoveAppQueue(connectionId, appId),
                    payload,
                ),
            ),

        updateYarnQueue: async (connectionId, payload) =>
            mapYarnMutation(
                await putJson<YarnMutationResultDto>(API_PATHS.explorer.yarnQueues(connectionId), payload),
            ),

        removeYarnQueue: async (connectionId, payload) =>
            mapYarnMutation(
                await postJson<YarnMutationResultDto>(
                    API_PATHS.explorer.yarnRemoveQueue(connectionId),
                    payload,
                ),
            ),

        fetchJenkinsInfo: async (connectionId) =>
            getJson(API_PATHS.explorer.jenkinsInfo(connectionId)),

        fetchJenkinsViews: async (connectionId) =>
            getJson(API_PATHS.explorer.jenkinsViews(connectionId)),

        fetchJenkinsJobs: async (connectionId, options) =>
            getJson(API_PATHS.explorer.jenkinsJobs(connectionId), {
                name: options?.name,
                limit: options?.limit != null ? String(options.limit) : undefined,
                view: options?.view,
                folder: options?.folder,
                browse: options?.browse != null ? String(options.browse) : undefined,
            }),

        fetchJenkinsJobDetail: async (connectionId, jobName) =>
            getJson(API_PATHS.explorer.jenkinsJob(connectionId), {name: jobName}),

        triggerJenkinsBuild: async (connectionId, jobName, payload) =>
            postJson(
                `${API_PATHS.explorer.jenkinsJobBuild(connectionId)}?name=${encodeURIComponent(jobName)}`,
                payload ?? {},
            ),

        stopJenkinsBuild: async (connectionId, jobName, buildNumber) =>
            postJson(
                `${API_PATHS.explorer.jenkinsJobStopBuild(connectionId, buildNumber)}?name=${encodeURIComponent(jobName)}`,
                {},
            ),

        fetchJenkinsBuildLog: async (connectionId, jobName, buildNumber, options) =>
            getJson(API_PATHS.explorer.jenkinsJobBuildLog(connectionId, buildNumber), {
                name: jobName,
                start: options?.start != null ? String(options.start) : undefined,
            }),

        fetchJenkinsQueue: async (connectionId, options) =>
            getJson(API_PATHS.explorer.jenkinsQueue(connectionId), {
                name: options?.name,
            }),

        fetchJenkinsNodes: async (connectionId) =>
            getJson(API_PATHS.explorer.jenkinsNodes(connectionId)),

        fetchNacosInfo: async (connectionId) =>
            getJson(API_PATHS.explorer.nacosInfo(connectionId)),

        fetchNacosNamespaces: async (connectionId) =>
            getJson(API_PATHS.explorer.nacosNamespaces(connectionId)),

        detectNacosNamespaces: async (config: ConnectionConfig) =>
            postJson(API_PATHS.explorer.nacosNamespacesDetect(), config),

        fetchNacosConfigs: async (connectionId, options) =>
            getJson(API_PATHS.explorer.nacosConfigs(connectionId), {
                namespaceId: options?.namespaceId,
                dataId: options?.dataId,
                group: options?.group,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchNacosConfig: async (connectionId, options) =>
            getJson(API_PATHS.explorer.nacosConfig(connectionId), {
                dataId: options.dataId,
                group: options.group,
                namespaceId: options.namespaceId,
            }),

        updateNacosConfig: async (connectionId, payload) =>
            putJson(API_PATHS.explorer.nacosConfig(connectionId), payload),

        fetchNacosServices: async (connectionId, options) =>
            getJson(API_PATHS.explorer.nacosServices(connectionId), {
                namespaceId: options?.namespaceId,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchNacosInstances: async (connectionId, options) =>
            getJson(API_PATHS.explorer.nacosInstances(connectionId), {
                serviceName: options.serviceName,
                groupName: options.groupName,
                namespaceId: options.namespaceId,
            }),

        fetchPolarisInfo: async (connectionId) =>
            getJson(API_PATHS.explorer.polarisInfo(connectionId)),

        fetchPolarisNamespaces: async (connectionId) =>
            getJson(API_PATHS.explorer.polarisNamespaces(connectionId)),

        fetchPolarisServices: async (connectionId, options) =>
            getJson(API_PATHS.explorer.polarisServices(connectionId), {
                namespace: options?.namespace,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchPolarisInstances: async (connectionId, options) =>
            getJson(API_PATHS.explorer.polarisInstances(connectionId), {
                namespace: options.namespace,
                service: options.service,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchPolarisConfigs: async (connectionId, options) =>
            getJson(API_PATHS.explorer.polarisConfigs(connectionId), {
                namespace: options?.namespace,
                group: options?.group,
                name: options?.name,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchPolarisConfig: async (connectionId, options) =>
            getJson(API_PATHS.explorer.polarisConfig(connectionId), {
                namespace: options.namespace,
                group: options.group,
                name: options.name,
            }),

        updatePolarisConfig: async (connectionId, payload) =>
            putJson(API_PATHS.explorer.polarisConfig(connectionId), payload),

        fetchK8sClusterInfo: async (connectionId) =>
            getJson(API_PATHS.explorer.k8sInfo(connectionId)),

        fetchK8sNamespaces: async (connectionId, options) =>
            getJson(API_PATHS.explorer.k8sNamespaces(connectionId), {
                name: options?.name,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchK8sPods: async (connectionId, namespace, options) =>
            getJson(API_PATHS.explorer.k8sPods(connectionId, namespace), {
                labelSelector: options?.labelSelector,
                fieldSelector: options?.fieldSelector,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchK8sPodDetail: async (connectionId, namespace, podName, options) =>
            getJson(
                API_PATHS.explorer.k8sPod(connectionId, namespace, podName),
                undefined,
                {silent: options?.silent},
            ),

        fetchK8sPodLogs: async (connectionId, namespace, podName, options) =>
            getJson(
                API_PATHS.explorer.k8sPodLogs(connectionId, namespace, podName),
                {
                    container: options?.container,
                    tailLines: options?.tailLines != null ? String(options.tailLines) : undefined,
                },
                {silent: options?.silent},
            ),

        fetchK8sDeployments: async (connectionId, namespace, options) =>
            getJson(API_PATHS.explorer.k8sDeployments(connectionId, namespace), {
                labelSelector: options?.labelSelector,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchK8sServices: async (connectionId, namespace, options) =>
            getJson(API_PATHS.explorer.k8sServices(connectionId, namespace), {
                labelSelector: options?.labelSelector,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchK8sConfigMaps: async (connectionId, namespace, options) =>
            getJson(API_PATHS.explorer.k8sConfigMaps(connectionId, namespace), {
                labelSelector: options?.labelSelector,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchK8sSecrets: async (connectionId, namespace, options) =>
            getJson(API_PATHS.explorer.k8sSecrets(connectionId, namespace), {
                labelSelector: options?.labelSelector,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchK8sEvents: async (connectionId, namespace, options) =>
            getJson(API_PATHS.explorer.k8sEvents(connectionId, namespace), {
                involvedName: options?.involvedName,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchK8sCrds: async (connectionId, options) =>
            getJson(API_PATHS.explorer.k8sCrds(connectionId), {
                name: options?.name,
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        fetchK8sHelmReleases: async (connectionId, namespace, options) =>
            getJson(API_PATHS.explorer.k8sHelmReleases(connectionId, namespace), {
                limit: options?.limit != null ? String(options.limit) : undefined,
            }),

        applyK8sYaml: async (connectionId, yaml, namespace) =>
            postJson(API_PATHS.explorer.k8sApply(connectionId), {
                yaml,
                ...(namespace ? {namespace} : {}),
            }),

        deleteK8sPod: async (connectionId, namespace, podName) =>
            deleteJson(API_PATHS.explorer.k8sPod(connectionId, namespace, podName)),

        restartK8sDeployment: async (connectionId, namespace, deploymentName) =>
            postJson(API_PATHS.explorer.k8sRestartDeployment(connectionId, namespace, deploymentName), {}),

        fetchConnection: async (connectionId) =>
            getJson<ConnectionConfig>(API_PATHS.explorer.connection(connectionId)),

        connectConnection: async (connectionId) =>
            mapTestResult(
                await postJson<WireConnectionTestResult>(
                    API_PATHS.explorer.connectConnection(connectionId),
                    {},
                ),
            ),

        pingConnection: async (connectionId) =>
            mapTestResult(
                await getJson<WireConnectionTestResult>(
                    API_PATHS.explorer.pingConnection(connectionId),
                    undefined,
                    {
                        silent: true,
                        // 休眠唤醒后避免挂死 UI；后端也会加 JDBC connectTimeout
                        timeoutMs: 20_000,
                    },
                ),
            ),

        touchConnection: async (connectionId) =>
            postJson<boolean>(API_PATHS.explorer.touchConnection(connectionId), {}),

        disconnectConnection: async (connectionId) => {
            await postJson<void>(API_PATHS.explorer.disconnectConnection(connectionId), {})
        },

        listPooledConnections: async () =>
            getJson<string[]>(API_PATHS.explorer.pooledConnections),

        reconnectConnection: async (connectionId) =>
            mapTestResult(
                await postJson<WireConnectionTestResult>(
                    API_PATHS.explorer.reconnectConnection(connectionId),
                    {},
                ),
            ),

        createGroup: async (label, parentId) =>
            mapGroupResult(
                await postJson<GroupResultDto>(API_PATHS.explorer.groups, {
                    label,
                    ...(parentId ? {parentId} : {}),
                }),
            ),

        updateGroup: async (groupId, label) => {
            const data = await putJson<TreePayloadDto>(API_PATHS.explorer.group(groupId), {
                label,
            })
            return mapTreeNodes(data.tree)
        },

        createConnection: async (config, groupId) =>
            mapConnectionResult(
                await postJson<ConnectionResultDto>(API_PATHS.explorer.connections, {
                    config,
                    groupId,
                }),
            ),

        updateConnection: async (connectionId, config) => {
            const data = await putJson<TreePayloadDto>(
                API_PATHS.explorer.connection(connectionId),
                config,
            )
            return mapTreeNodes(data.tree)
        },

        moveConnection: async (connectionId, targetGroupId) => {
            const data = await putJson<TreePayloadDto>(
                API_PATHS.explorer.connectionGroup(connectionId),
                {groupId: targetGroupId},
            )
            return mapTreeNodes(data.tree)
        },

        reorderCatalogNode: async (nodeId, targetId, position) => {
            const data = await putJson<TreePayloadDto>(API_PATHS.explorer.reorder, {
                nodeId,
                targetId,
                position,
            })
            return mapTreeNodes(data.tree)
        },

        deleteNode: async (nodeId) => {
            const data = await deleteJson<TreePayloadDto>(API_PATHS.explorer.node(nodeId))
            return mapTreeNodes(data.tree)
        },

        importConnections: async (configs) =>
            mapImportResult(
                await postJson<ImportConnectionsResultDto>(API_PATHS.explorer.importConnections, {
                    configs,
                }),
            ),

        createDatabase: async (connectionId, payload) =>
            mapCreateNamespace(
                await postJson<CreateNamespaceResultDto>(
                    API_PATHS.explorer.createDatabase(connectionId),
                    payload,
                ),
            ),

        deleteDatabase: async (connectionId, name) =>
            mapCreateNamespace(
                await deleteJson<CreateNamespaceResultDto>(
                    API_PATHS.explorer.deleteDatabase(connectionId, name),
                ),
            ),

        createSchema: async (connectionId, payload) =>
            mapCreateNamespace(
                await postJson<CreateNamespaceResultDto>(
                    API_PATHS.explorer.createSchema(connectionId),
                    payload,
                ),
            ),

        fetchMysqlCharsets: async (connectionId) =>
            getJson(API_PATHS.explorer.mysqlCharsets(connectionId)),
    }
}
