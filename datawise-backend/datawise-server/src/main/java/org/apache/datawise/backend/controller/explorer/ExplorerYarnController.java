package org.apache.datawise.backend.controller.explorer;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.support.PerfLogger;
import org.apache.datawise.backend.database.explorer.CreateNamespaceService;
import org.apache.datawise.backend.database.explorer.ExplorerConnectionAdminService;
import org.apache.datawise.backend.database.explorer.ExplorerConnectionLifecycleService;
import org.apache.datawise.backend.database.explorer.ExplorerJenkinsService;
import org.apache.datawise.backend.database.explorer.ExplorerKafkaService;
import org.apache.datawise.backend.database.explorer.ExplorerKubernetesService;
import org.apache.datawise.backend.database.explorer.ExplorerNacosService;
import org.apache.datawise.backend.database.explorer.ExplorerPolarisService;
import org.apache.datawise.backend.database.explorer.ExplorerRedisService;
import org.apache.datawise.backend.database.explorer.ExplorerYarnService;
import org.apache.datawise.backend.database.explorer.ExplorerLoadOptions;
import org.apache.datawise.backend.database.explorer.ExplorerSchemaService;
import org.apache.datawise.backend.database.explorer.ExplorerChildLoadOutcome;
import org.apache.datawise.backend.database.explorer.ExplorerLoadMetrics;
import org.apache.datawise.backend.database.explorer.ExplorerTreeEtag;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.domain.ConnectionResult;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.CreateConnectionRequest;
import org.apache.datawise.backend.domain.CreateDatabaseRequest;
import org.apache.datawise.backend.domain.CreateNamespaceResult;
import org.apache.datawise.backend.domain.CreateSchemaRequest;
import org.apache.datawise.backend.domain.GroupResult;
import org.apache.datawise.backend.domain.MysqlCharsetOptionsResult;
import org.apache.datawise.backend.domain.NacosConfigContentDto;
import org.apache.datawise.backend.domain.NacosConfigsResultDto;
import org.apache.datawise.backend.domain.NacosInfoDto;
import org.apache.datawise.backend.domain.NacosInstancesResultDto;
import org.apache.datawise.backend.domain.NacosNamespacesResultDto;
import org.apache.datawise.backend.domain.NacosServicesResultDto;
import org.apache.datawise.backend.domain.UpdateNacosConfigRequest;
import org.apache.datawise.backend.domain.UpdatePolarisConfigRequest;
import org.apache.datawise.backend.domain.ImportConnectionsRequest;
import org.apache.datawise.backend.domain.ImportConnectionsResult;
import org.apache.datawise.backend.domain.JenkinsBuildLogDto;
import org.apache.datawise.backend.domain.JenkinsInfoDto;
import org.apache.datawise.backend.domain.JenkinsJobDetailDto;
import org.apache.datawise.backend.domain.JenkinsJobsResultDto;
import org.apache.datawise.backend.domain.JenkinsMutationResultDto;
import org.apache.datawise.backend.domain.JenkinsNodesResultDto;
import org.apache.datawise.backend.domain.JenkinsQueueResultDto;
import org.apache.datawise.backend.domain.JenkinsTriggerBuildRequest;
import org.apache.datawise.backend.domain.JenkinsViewsResultDto;
import org.apache.datawise.backend.domain.K8sApplyResultDto;
import org.apache.datawise.backend.domain.K8sClusterInfoDto;
import org.apache.datawise.backend.domain.K8sConfigMapsResultDto;
import org.apache.datawise.backend.domain.K8sCrdsResultDto;
import org.apache.datawise.backend.domain.K8sDeploymentsResultDto;
import org.apache.datawise.backend.domain.K8sEventsResultDto;
import org.apache.datawise.backend.domain.K8sHelmReleasesResultDto;
import org.apache.datawise.backend.domain.K8sLogsDto;
import org.apache.datawise.backend.domain.K8sMutationResultDto;
import org.apache.datawise.backend.domain.K8sNamespacesResultDto;
import org.apache.datawise.backend.domain.K8sPodDetailDto;
import org.apache.datawise.backend.domain.K8sPodsResultDto;
import org.apache.datawise.backend.domain.K8sSecretsResultDto;
import org.apache.datawise.backend.domain.K8sServicesResultDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupMetricsDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupsResultDto;
import org.apache.datawise.backend.domain.KafkaMessagesResultDto;
import org.apache.datawise.backend.domain.KafkaProduceResultDto;
import org.apache.datawise.backend.domain.KafkaTopicDetailDto;
import org.apache.datawise.backend.domain.KafkaTopicsResultDto;
import org.apache.datawise.backend.domain.ProduceKafkaMessageRequest;
import org.apache.datawise.backend.domain.PublishTableToKafkaRequest;
import org.apache.datawise.backend.domain.PublishTableToKafkaResult;
import org.apache.datawise.backend.domain.PolarisConfigContentDto;
import org.apache.datawise.backend.domain.PolarisConfigGroupsResultDto;
import org.apache.datawise.backend.domain.PolarisConfigsResultDto;
import org.apache.datawise.backend.domain.PolarisInfoDto;
import org.apache.datawise.backend.domain.PolarisInstancesResultDto;
import org.apache.datawise.backend.domain.PolarisNamespacesResultDto;
import org.apache.datawise.backend.domain.PolarisServicesResultDto;
import org.apache.datawise.backend.domain.ExecuteRedisCommandRequest;
import org.apache.datawise.backend.domain.RedisCommandResultDto;
import org.apache.datawise.backend.domain.RedisKeyDetailDto;
import org.apache.datawise.backend.domain.RedisKeysScanResultDto;
import org.apache.datawise.backend.domain.YarnAppDetailDto;
import org.apache.datawise.backend.domain.YarnKillApplicationRequest;
import org.apache.datawise.backend.domain.YarnMoveApplicationQueueRequest;
import org.apache.datawise.backend.domain.YarnMutationResultDto;
import org.apache.datawise.backend.domain.YarnRemoveQueueRequest;
import org.apache.datawise.backend.domain.YarnUpdateQueueRequest;
import org.apache.datawise.backend.domain.YarnAppsResultDto;
import org.apache.datawise.backend.domain.YarnClusterInfoDto;
import org.apache.datawise.backend.domain.YarnNodesResultDto;
import org.apache.datawise.backend.domain.YarnQueuesResultDto;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.domain.TreePayload;
import org.apache.datawise.backend.security.HeadlessSqlAuth;
import org.apache.datawise.backend.server.pack.EntitlementService;
import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/explorer")
public class ExplorerYarnController {

    private final ExplorerYarnService yarnService;
    private final FeaturePermissionAccess featurePermissionAccess;

    public ExplorerYarnController(
            ExplorerYarnService yarnService,
            FeaturePermissionAccess featurePermissionAccess
    ) {
        this.yarnService = yarnService;
        this.featurePermissionAccess = featurePermissionAccess;
    }

        @GetMapping("/connections/{connectionId}/yarn/info")
        public ApiResponse<YarnClusterInfoDto> yarnClusterInfo(@PathVariable String connectionId) {
            return ApiResponse.ok(yarnService.clusterInfo(connectionId));
        }
    
        @GetMapping("/connections/{connectionId}/yarn/apps")
        public ApiResponse<YarnAppsResultDto> listYarnApplications(
                @PathVariable String connectionId,
                @RequestParam(required = false) String state,
                @RequestParam(required = false) String user,
                @RequestParam(required = false) String queue,
                @RequestParam(required = false) Integer limit
        ) {
            return ApiResponse.ok(yarnService.listApplications(connectionId, state, user, queue, limit));
        }
    
        @GetMapping("/connections/{connectionId}/yarn/apps/{appId}")
        public ApiResponse<YarnAppDetailDto> describeYarnApplication(
                @PathVariable String connectionId,
                @PathVariable String appId
        ) {
            return ApiResponse.ok(yarnService.describeApplication(connectionId, appId));
        }
    
        @GetMapping("/connections/{connectionId}/yarn/nodes")
        public ApiResponse<YarnNodesResultDto> listYarnNodes(
                @PathVariable String connectionId,
                @RequestParam(required = false) Integer limit
        ) {
            return ApiResponse.ok(yarnService.listNodes(connectionId, limit));
        }
    
        @GetMapping("/connections/{connectionId}/yarn/queues")
        public ApiResponse<YarnQueuesResultDto> listYarnQueues(@PathVariable String connectionId) {
            return ApiResponse.ok(yarnService.listQueues(connectionId));
        }
    
        @PutMapping("/connections/{connectionId}/yarn/apps/{appId}/state")
        public ApiResponse<YarnMutationResultDto> killYarnApplication(
                @PathVariable String connectionId,
                @PathVariable String appId,
                @RequestBody(required = false) YarnKillApplicationRequest request
        ) {
            featurePermissionAccess.requireExplorerContextExport();
            return ApiResponse.ok(yarnService.killApplication(connectionId, appId, request));
        }
    
        @PutMapping("/connections/{connectionId}/yarn/apps/{appId}/queue")
        public ApiResponse<YarnMutationResultDto> moveYarnApplicationQueue(
                @PathVariable String connectionId,
                @PathVariable String appId,
                @RequestBody YarnMoveApplicationQueueRequest request
        ) {
            featurePermissionAccess.requireExplorerContextExport();
            return ApiResponse.ok(yarnService.moveApplicationQueue(connectionId, appId, request));
        }
    
        @PutMapping("/connections/{connectionId}/yarn/queues")
        public ApiResponse<YarnMutationResultDto> updateYarnQueue(
                @PathVariable String connectionId,
                @RequestBody YarnUpdateQueueRequest request
        ) {
            featurePermissionAccess.requireExplorerContextExport();
            return ApiResponse.ok(yarnService.updateQueue(connectionId, request));
        }
    
        @PostMapping("/connections/{connectionId}/yarn/queues/remove")
        public ApiResponse<YarnMutationResultDto> removeYarnQueue(
                @PathVariable String connectionId,
                @RequestBody YarnRemoveQueueRequest request
        ) {
            featurePermissionAccess.requireExplorerContextExport();
            return ApiResponse.ok(yarnService.removeQueue(connectionId, request));
        }
}
