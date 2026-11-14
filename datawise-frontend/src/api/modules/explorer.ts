import {api} from '@/shared/api'
import type {ConnectionConfig} from '@/core/types'

/** 连接树：数据源与结构浏览 */
export const explorerApi = {
    fetchTree: (options?: { refresh?: boolean }) => api.explorer.fetchTree(options),
    loadChildren: (
        connectionId: string,
        nodeId: string,
        options?: {
            silent?: boolean
            pattern?: string
            refresh?: boolean
            offset?: number
            limit?: number
            ifNoneMatch?: string
        },
    ) => api.explorer.loadChildren(connectionId, nodeId, options),
    pingConnection: (connectionId: string) => api.explorer.pingConnection(connectionId),
    fetchRedisKey: (connectionId: string, key: string, options?: { database?: number }) =>
        api.explorer.fetchRedisKey(connectionId, key, options),
    fetchRedisKeysScan: (
        connectionId: string,
        options?: { pattern?: string; cursor?: string; count?: number; database?: number },
    ) => api.explorer.fetchRedisKeysScan(connectionId, options),
    executeRedisCommand: (connectionId: string, command: string, options?: { database?: number }) =>
        api.explorer.executeRedisCommand(connectionId, command, options),
    fetchElasticsearchIndices: (connectionId: string) =>
        api.explorer.fetchElasticsearchIndices(connectionId),
    fetchElasticsearchIndexMetadata: (connectionId: string, index: string, options?: {kind?: string}) =>
        api.explorer.fetchElasticsearchIndexMetadata(connectionId, index, options),
    executeElasticsearchRest: (connectionId: string, requestText: string) =>
        api.explorer.executeElasticsearchRest(connectionId, requestText),
    clearElasticsearchIndex: (connectionId: string, index: string) =>
        api.explorer.clearElasticsearchIndex(connectionId, index),
    fetchElasticsearchDocuments: (
        connectionId: string,
        index: string,
        options?: {offset?: number; limit?: number; filter?: string},
    ) => api.explorer.fetchElasticsearchDocuments(connectionId, index, options),
    countElasticsearchDocuments: (connectionId: string, index: string, options?: {filter?: string}) =>
        api.explorer.countElasticsearchDocuments(connectionId, index, options),
    fetchElasticsearchDocument: (connectionId: string, index: string, id: string) =>
        api.explorer.fetchElasticsearchDocument(connectionId, index, id),
    upsertElasticsearchDocument: (
        connectionId: string,
        index: string,
        payload: {id?: string; sourceJson: string; routing?: string},
    ) => api.explorer.upsertElasticsearchDocument(connectionId, index, payload),
    deleteElasticsearchDocument: (
        connectionId: string,
        index: string,
        id: string,
        options?: {routing?: string},
    ) => api.explorer.deleteElasticsearchDocument(connectionId, index, id, options),
    fetchKafkaTopics: (
        connectionId: string,
        options?: { pattern?: string; limit?: number },
    ) => api.explorer.fetchKafkaTopics(connectionId, options),
    fetchKafkaClusterInfo: (connectionId: string) =>
        api.explorer.fetchKafkaClusterInfo(connectionId),
    createKafkaTopic: (
        connectionId: string,
        payload: { name: string; partitions?: number; replicationFactor?: number },
    ) => api.explorer.createKafkaTopic(connectionId, payload),
    fetchKafkaTopicDetail: (connectionId: string, topic: string) =>
        api.explorer.fetchKafkaTopicDetail(connectionId, topic),
    deleteKafkaTopic: (connectionId: string, topic: string) =>
        api.explorer.deleteKafkaTopic(connectionId, topic),
    increaseKafkaTopicPartitions: (connectionId: string, topic: string, partitions: number) =>
        api.explorer.increaseKafkaTopicPartitions(connectionId, topic, partitions),
    fetchKafkaTopicConfigs: (connectionId: string, topic: string) =>
        api.explorer.fetchKafkaTopicConfigs(connectionId, topic),
    updateKafkaTopicConfigs: (
        connectionId: string,
        topic: string,
        payload: { retentionMs?: number | null; retentionBytes?: number | null },
    ) => api.explorer.updateKafkaTopicConfigs(connectionId, topic, payload),
    fetchKafkaMessages: (
        connectionId: string,
        topic: string,
        options?: {
            partition?: number
            offset?: number
            limit?: number
            fromBeginning?: boolean
        },
    ) => api.explorer.fetchKafkaMessages(connectionId, topic, options),
    produceKafkaMessage: (
        connectionId: string,
        topic: string,
        payload: { key?: string; value: string; partition?: number },
    ) => api.explorer.produceKafkaMessage(connectionId, topic, payload),
    publishTableToKafka: (
        connectionId: string,
        payload: import('@/features/explorer/services/kafka-topic.service').PublishTableToKafkaRequest,
        options?: { silent?: boolean },
    ) => api.explorer.publishTableToKafka(connectionId, payload, options),
    fetchKafkaConsumerGroups: (
        connectionId: string,
        options?: { pattern?: string; limit?: number },
    ) => api.explorer.fetchKafkaConsumerGroups(connectionId, options),
    fetchKafkaConsumerGroupMetrics: (
        connectionId: string,
        groupId: string,
        options?: { topic?: string },
    ) => api.explorer.fetchKafkaConsumerGroupMetrics(connectionId, groupId, options),
    resetKafkaConsumerGroupOffsets: (
        connectionId: string,
        groupId: string,
        payload: { topic: string; strategy: 'earliest' | 'latest' },
    ) => api.explorer.resetKafkaConsumerGroupOffsets(connectionId, groupId, payload),
    fetchYarnClusterInfo: (connectionId: string) => api.explorer.fetchYarnClusterInfo(connectionId),
    fetchYarnApplications: (
        connectionId: string,
        options?: { state?: string; user?: string; queue?: string; limit?: number },
    ) => api.explorer.fetchYarnApplications(connectionId, options),
    fetchYarnApplicationDetail: (connectionId: string, appId: string) =>
        api.explorer.fetchYarnApplicationDetail(connectionId, appId),
    fetchYarnNodes: (connectionId: string, options?: { limit?: number }) =>
        api.explorer.fetchYarnNodes(connectionId, options),
    fetchYarnQueues: (connectionId: string) => api.explorer.fetchYarnQueues(connectionId),
    killYarnApplication: (
        connectionId: string,
        appId: string,
        payload?: { diagnostics?: string },
    ) => api.explorer.killYarnApplication(connectionId, appId, payload),
    moveYarnApplicationQueue: (
        connectionId: string,
        appId: string,
        payload: { queue: string },
    ) => api.explorer.moveYarnApplicationQueue(connectionId, appId, payload),
    updateYarnQueue: (
        connectionId: string,
        payload: { queueName: string; params: Record<string, string> },
    ) => api.explorer.updateYarnQueue(connectionId, payload),
    removeYarnQueue: (connectionId: string, payload: { queueName: string }) =>
        api.explorer.removeYarnQueue(connectionId, payload),
    fetchJenkinsInfo: (connectionId: string) => api.explorer.fetchJenkinsInfo(connectionId),
    fetchJenkinsViews: (connectionId: string) => api.explorer.fetchJenkinsViews(connectionId),
    fetchJenkinsJobs: (
        connectionId: string,
        options?: { name?: string; limit?: number; view?: string; folder?: string; browse?: boolean },
    ) => api.explorer.fetchJenkinsJobs(connectionId, options),
    fetchJenkinsJobDetail: (connectionId: string, jobName: string) =>
        api.explorer.fetchJenkinsJobDetail(connectionId, jobName),
    triggerJenkinsBuild: (
        connectionId: string,
        jobName: string,
        payload?: { parameters?: Record<string, string> },
    ) => api.explorer.triggerJenkinsBuild(connectionId, jobName, payload),
    stopJenkinsBuild: (connectionId: string, jobName: string, buildNumber: number) =>
        api.explorer.stopJenkinsBuild(connectionId, jobName, buildNumber),
    fetchJenkinsBuildLog: (
        connectionId: string,
        jobName: string,
        buildNumber: number,
        options?: { start?: number },
    ) => api.explorer.fetchJenkinsBuildLog(connectionId, jobName, buildNumber, options),
    fetchJenkinsQueue: (
        connectionId: string,
        options?: { name?: string },
    ) => api.explorer.fetchJenkinsQueue(connectionId, options),
    fetchJenkinsNodes: (connectionId: string) => api.explorer.fetchJenkinsNodes(connectionId),
    fetchNacosInfo: (connectionId: string) => api.explorer.fetchNacosInfo(connectionId),
    fetchNacosNamespaces: (connectionId: string) => api.explorer.fetchNacosNamespaces(connectionId),
    detectNacosNamespaces: (config: ConnectionConfig) => api.explorer.detectNacosNamespaces(config),
    fetchNacosConfigs: (
        connectionId: string,
        options?: { namespaceId?: string; dataId?: string; group?: string; limit?: number },
    ) => api.explorer.fetchNacosConfigs(connectionId, options),
    fetchNacosConfig: (
        connectionId: string,
        options: { dataId: string; group?: string; namespaceId?: string },
    ) => api.explorer.fetchNacosConfig(connectionId, options),
    updateNacosConfig: (
        connectionId: string,
        payload: {
            dataId: string
            group?: string
            namespaceId?: string
            content: string
            type?: string
        },
    ) => api.explorer.updateNacosConfig(connectionId, payload),
    fetchNacosServices: (
        connectionId: string,
        options?: { namespaceId?: string; limit?: number },
    ) => api.explorer.fetchNacosServices(connectionId, options),
    fetchNacosInstances: (
        connectionId: string,
        options: { serviceName: string; groupName?: string; namespaceId?: string },
    ) => api.explorer.fetchNacosInstances(connectionId, options),
    fetchPolarisInfo: (connectionId: string) => api.explorer.fetchPolarisInfo(connectionId),
    fetchPolarisNamespaces: (connectionId: string) => api.explorer.fetchPolarisNamespaces(connectionId),
    fetchPolarisServices: (
        connectionId: string,
        options?: { namespace?: string; limit?: number },
    ) => api.explorer.fetchPolarisServices(connectionId, options),
    fetchPolarisInstances: (
        connectionId: string,
        options: { namespace: string; service: string; limit?: number },
    ) => api.explorer.fetchPolarisInstances(connectionId, options),
    fetchPolarisConfigs: (
        connectionId: string,
        options?: { namespace?: string; group?: string; name?: string; limit?: number },
    ) => api.explorer.fetchPolarisConfigs(connectionId, options),
    fetchPolarisConfig: (
        connectionId: string,
        options: { name: string; group?: string; namespace?: string },
    ) => api.explorer.fetchPolarisConfig(connectionId, options),
    updatePolarisConfig: (
        connectionId: string,
        payload: {
            name: string
            namespace?: string
            group?: string
            content: string
            format?: string
        },
    ) => api.explorer.updatePolarisConfig(connectionId, payload),
    fetchK8sClusterInfo: (connectionId: string) => api.explorer.fetchK8sClusterInfo(connectionId),
    fetchK8sNamespaces: (
        connectionId: string,
        options?: { name?: string; limit?: number },
    ) => api.explorer.fetchK8sNamespaces(connectionId, options),
    fetchK8sPods: (
        connectionId: string,
        namespace: string,
        options?: { labelSelector?: string; fieldSelector?: string; limit?: number },
    ) => api.explorer.fetchK8sPods(connectionId, namespace, options),
    fetchK8sPodDetail: (
        connectionId: string,
        namespace: string,
        podName: string,
        options?: { silent?: boolean },
    ) => api.explorer.fetchK8sPodDetail(connectionId, namespace, podName, options),
    fetchK8sPodLogs: (
        connectionId: string,
        namespace: string,
        podName: string,
        options?: { container?: string; tailLines?: number; silent?: boolean },
    ) => api.explorer.fetchK8sPodLogs(connectionId, namespace, podName, options),
    fetchK8sDeployments: (
        connectionId: string,
        namespace: string,
        options?: { labelSelector?: string; limit?: number },
    ) => api.explorer.fetchK8sDeployments(connectionId, namespace, options),
    fetchK8sServices: (
        connectionId: string,
        namespace: string,
        options?: { labelSelector?: string; limit?: number },
    ) => api.explorer.fetchK8sServices(connectionId, namespace, options),
    fetchK8sConfigMaps: (
        connectionId: string,
        namespace: string,
        options?: { labelSelector?: string; limit?: number },
    ) => api.explorer.fetchK8sConfigMaps(connectionId, namespace, options),
    fetchK8sSecrets: (
        connectionId: string,
        namespace: string,
        options?: { labelSelector?: string; limit?: number },
    ) => api.explorer.fetchK8sSecrets(connectionId, namespace, options),
    fetchK8sEvents: (
        connectionId: string,
        namespace: string,
        options?: { involvedName?: string; limit?: number },
    ) => api.explorer.fetchK8sEvents(connectionId, namespace, options),
    fetchK8sCrds: (
        connectionId: string,
        options?: { name?: string; limit?: number },
    ) => api.explorer.fetchK8sCrds(connectionId, options),
    fetchK8sHelmReleases: (
        connectionId: string,
        namespace: string,
        options?: { limit?: number },
    ) => api.explorer.fetchK8sHelmReleases(connectionId, namespace, options),
    applyK8sYaml: (connectionId: string, yaml: string, namespace?: string) =>
        api.explorer.applyK8sYaml(connectionId, yaml, namespace),
    deleteK8sPod: (connectionId: string, namespace: string, podName: string) =>
        api.explorer.deleteK8sPod(connectionId, namespace, podName),
    restartK8sDeployment: (connectionId: string, namespace: string, deploymentName: string) =>
        api.explorer.restartK8sDeployment(connectionId, namespace, deploymentName),
    fetchConnection: (connectionId: string) => api.explorer.fetchConnection(connectionId),
    connectConnection: (connectionId: string) => api.explorer.connectConnection(connectionId),
    touchConnection: (connectionId: string) => api.explorer.touchConnection(connectionId),
    disconnectConnection: (connectionId: string) => api.explorer.disconnectConnection(connectionId),
    listPooledConnections: () => api.explorer.listPooledConnections(),
    reconnectConnection: (connectionId: string) => api.explorer.reconnectConnection(connectionId),
    createGroup: (label: string, parentId?: string) => api.explorer.createGroup(label, parentId),
    updateGroup: (groupId: string, label: string) => api.explorer.updateGroup(groupId, label),
    createConnection: (config: ConnectionConfig, groupId?: string) =>
        api.explorer.createConnection(config, groupId),
    updateConnection: (connectionId: string, config: ConnectionConfig) =>
        api.explorer.updateConnection(connectionId, config),
    moveConnection: (connectionId: string, targetGroupId: string) =>
        api.explorer.moveConnection(connectionId, targetGroupId),
    reorderCatalogNode: (
        nodeId: string,
        targetId: string,
        position: 'before' | 'after' | 'inside',
    ) => api.explorer.reorderCatalogNode(nodeId, targetId, position),
    deleteNode: (nodeId: string) => api.explorer.deleteNode(nodeId),
    importConnections: (configs: ConnectionConfig[]) => api.explorer.importConnections(configs),
    createDatabase: (
        connectionId: string,
        payload: { name: string; charset?: string; collation?: string },
    ) => api.explorer.createDatabase(connectionId, payload),
    deleteDatabase: (connectionId: string, name: string) =>
        api.explorer.deleteDatabase(connectionId, name),
    createSchema: (
        connectionId: string,
        payload: { name: string; catalog?: string },
    ) => api.explorer.createSchema(connectionId, payload),
    fetchMysqlCharsets: (connectionId: string) => api.explorer.fetchMysqlCharsets(connectionId),
    fetchEngines: (connectionId: string) => api.explorer.fetchEngines(connectionId),
    fetchDataTypes: (connectionId: string) => api.explorer.fetchDataTypes(connectionId),
}
