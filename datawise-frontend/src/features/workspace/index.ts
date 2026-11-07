/**
 * Workspace feature public exports.
 * Cross-feature code should prefer this barrel over deep paths.
 */
export {useWorkspaceStore} from './stores/workspace'
export type {ConsoleQueryState, QueryResultItem} from './types'
export {
    applyStatelessOpenPatches,
    planOpenKafkaConsumerGroups,
    planOpenKafkaTopics,
    planOpenKafkaTablePublish,
    planOpenMongoConsole,
    planOpenRedisConsole,
    planOpenRedisKey,
    planOpenSshTerminal,
    type ConnectionOpenBase,
    type StatelessOpenDecision,
} from './services/workspace-stateless-open.service'
export {
    planOpenConfigCenter,
    planOpenNacosConfigs,
    planOpenNacosServices,
    planOpenPolarisConfigs,
    planOpenPolarisServices,
    planOpenElasticsearchConsole,
    planOpenYarnApplications,
    planOpenYarnNodes,
    planOpenYarnQueues,
    planOpenJenkinsJobs,
    planOpenJenkinsNodes,
    planOpenK8sPods,
    planOpenK8sDeployments,
    planOpenK8sServices,
    planOpenK8sEvents,
    planOpenK8sConfigMaps,
    planOpenK8sSecrets,
    planOpenK8sApply,
    planOpenK8sCrds,
    planOpenK8sHelm,
    planOpenK8sExec,
    findConfigCenterWorkbenchTab,
} from './services/workspace-platform-open.service'
export {nextWorkspaceTabId} from './services/workspace-tab-id'
export {
    ensureTabParams,
    getTabParam,
    patchTabParams,
    setTabParam,
} from './services/workspace-tab-params'
export {touchStatelessWorkspaceTab} from './services/workspace-tab-touch'
export {
    connectorEndpointFromConfig,
    isHttpConsoleUrl,
    openHttpConsole,
    useConnectorWorkbenchHeader,
    type FormatConnectorEndpoint,
} from './connector-kit'
