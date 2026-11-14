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

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;

@RestController
@RequestMapping("/api/explorer")
@RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_OPEN)
public class ExplorerPolarisController {

    private final ExplorerPolarisService polarisService;

    public ExplorerPolarisController(
            ExplorerPolarisService polarisService
    ) {
        this.polarisService = polarisService;
    }

        @GetMapping("/connections/{connectionId}/polaris/info")
        public ApiResponse<PolarisInfoDto> polarisInfo(@PathVariable String connectionId) {
            return ApiResponse.ok(polarisService.info(connectionId));
        }
    
        @GetMapping("/connections/{connectionId}/polaris/namespaces")
        public ApiResponse<PolarisNamespacesResultDto> listPolarisNamespaces(@PathVariable String connectionId) {
            return ApiResponse.ok(polarisService.listNamespaces(connectionId));
        }
    
        @GetMapping("/connections/{connectionId}/polaris/services")
        public ApiResponse<PolarisServicesResultDto> listPolarisServices(
                @PathVariable String connectionId,
                @RequestParam(required = false) String namespace,
                @RequestParam(required = false) Integer limit
        ) {
            return ApiResponse.ok(polarisService.listServices(connectionId, namespace, limit));
        }
    
        @GetMapping("/connections/{connectionId}/polaris/instances")
        public ApiResponse<PolarisInstancesResultDto> listPolarisInstances(
                @PathVariable String connectionId,
                @RequestParam(required = false) String namespace,
                @RequestParam String service,
                @RequestParam(required = false) Integer limit
        ) {
            return ApiResponse.ok(polarisService.listInstances(connectionId, namespace, service, limit));
        }
    
        @GetMapping("/connections/{connectionId}/polaris/config-groups")
        public ApiResponse<PolarisConfigGroupsResultDto> listPolarisConfigGroups(
                @PathVariable String connectionId,
                @RequestParam(required = false) String namespace,
                @RequestParam(required = false) Integer limit
        ) {
            return ApiResponse.ok(polarisService.listConfigGroups(connectionId, namespace, limit));
        }
    
        @GetMapping("/connections/{connectionId}/polaris/configs")
        public ApiResponse<PolarisConfigsResultDto> listPolarisConfigs(
                @PathVariable String connectionId,
                @RequestParam(required = false) String namespace,
                @RequestParam(required = false) String group,
                @RequestParam(required = false) String name,
                @RequestParam(required = false) Integer limit
        ) {
            return ApiResponse.ok(polarisService.listConfigs(connectionId, namespace, group, name, limit));
        }
    
        @GetMapping("/connections/{connectionId}/polaris/config")
        public ApiResponse<PolarisConfigContentDto> getPolarisConfig(
                @PathVariable String connectionId,
                @RequestParam(required = false) String namespace,
                @RequestParam(required = false) String group,
                @RequestParam String name
        ) {
            return ApiResponse.ok(polarisService.getConfig(connectionId, namespace, group, name));
        }
    
        @PutMapping("/connections/{connectionId}/polaris/config")
        @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS)
        public ApiResponse<PolarisConfigContentDto> updatePolarisConfig(
                @PathVariable String connectionId,
                @RequestBody UpdatePolarisConfigRequest request
        ) {
            return ApiResponse.ok(polarisService.updateConfig(
                    connectionId,
                    request != null ? request.namespace() : null,
                    request != null ? request.group() : null,
                    request != null ? request.name() : null,
                    request != null ? request.content() : null,
                    request != null ? request.format() : null
            ));
        }
}
