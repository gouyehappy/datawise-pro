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
import org.apache.datawise.backend.domain.KafkaClusterInfoDto;
import org.apache.datawise.backend.domain.KafkaMessagesResultDto;
import org.apache.datawise.backend.domain.KafkaMutationResultDto;
import org.apache.datawise.backend.domain.KafkaProduceResultDto;
import org.apache.datawise.backend.domain.KafkaTopicConfigsDto;
import org.apache.datawise.backend.domain.KafkaTopicDetailDto;
import org.apache.datawise.backend.domain.KafkaTopicsResultDto;
import org.apache.datawise.backend.domain.CreateKafkaTopicRequest;
import org.apache.datawise.backend.domain.IncreaseKafkaPartitionsRequest;
import org.apache.datawise.backend.domain.ProduceKafkaMessageRequest;
import org.apache.datawise.backend.domain.PublishTableToKafkaRequest;
import org.apache.datawise.backend.domain.PublishTableToKafkaResult;
import org.apache.datawise.backend.domain.ResetKafkaConsumerGroupOffsetsRequest;
import org.apache.datawise.backend.domain.UpdateKafkaTopicConfigsRequest;
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
import org.apache.datawise.backend.security.ExplorerFeatureGate;
import org.apache.datawise.backend.security.HeadlessSqlAuth;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresExplorerGate;
import org.apache.datawise.backend.security.RequiresFeature;
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
public class ExplorerKafkaController {

    private final ExplorerKafkaService kafkaService;

    public ExplorerKafkaController(ExplorerKafkaService kafkaService) {
        this.kafkaService = kafkaService;
    }

        @GetMapping("/connections/{connectionId}/kafka/topics")
        public ApiResponse<KafkaTopicsResultDto> listKafkaTopics(
                @PathVariable String connectionId,
                @RequestParam(required = false) String pattern,
                @RequestParam(required = false) Integer limit
        ) {
            return ApiResponse.ok(kafkaService.listTopics(connectionId, pattern, limit));
        }

        @GetMapping("/connections/{connectionId}/kafka/cluster")
        public ApiResponse<KafkaClusterInfoDto> describeKafkaCluster(
                @PathVariable String connectionId
        ) {
            return ApiResponse.ok(kafkaService.describeCluster(connectionId));
        }

        @PostMapping("/connections/{connectionId}/kafka/topics")
        @RequiresExplorerGate(ExplorerFeatureGate.CATALOG_MUTATION)
        public ApiResponse<KafkaMutationResultDto> createKafkaTopic(
                @PathVariable String connectionId,
                @RequestBody CreateKafkaTopicRequest request
        ) {
            return ApiResponse.ok(kafkaService.createTopic(
                    connectionId,
                    request.name(),
                    request.partitions(),
                    request.replicationFactor()
            ));
        }
    
        @GetMapping("/connections/{connectionId}/kafka/topics/{topic}")
        public ApiResponse<KafkaTopicDetailDto> describeKafkaTopic(
                @PathVariable String connectionId,
                @PathVariable String topic
        ) {
            return ApiResponse.ok(kafkaService.describeTopic(connectionId, topic));
        }

        @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS)
        @DeleteMapping("/connections/{connectionId}/kafka/topics/{topic}")
        public ApiResponse<KafkaMutationResultDto> deleteKafkaTopic(
                @PathVariable String connectionId,
                @PathVariable String topic
        ) {
            return ApiResponse.ok(kafkaService.deleteTopic(connectionId, topic));
        }

        @PutMapping("/connections/{connectionId}/kafka/topics/{topic}/partitions")
        @RequiresExplorerGate(ExplorerFeatureGate.CATALOG_MUTATION)
        public ApiResponse<KafkaMutationResultDto> increaseKafkaTopicPartitions(
                @PathVariable String connectionId,
                @PathVariable String topic,
                @RequestBody IncreaseKafkaPartitionsRequest request
        ) {
            return ApiResponse.ok(kafkaService.increasePartitions(connectionId, topic, request.partitions()));
        }

        @GetMapping("/connections/{connectionId}/kafka/topics/{topic}/configs")
        public ApiResponse<KafkaTopicConfigsDto> describeKafkaTopicConfigs(
                @PathVariable String connectionId,
                @PathVariable String topic
        ) {
            return ApiResponse.ok(kafkaService.describeTopicConfigs(connectionId, topic));
        }

        @PutMapping("/connections/{connectionId}/kafka/topics/{topic}/configs")
        @RequiresExplorerGate(ExplorerFeatureGate.CATALOG_MUTATION)
        public ApiResponse<KafkaMutationResultDto> updateKafkaTopicConfigs(
                @PathVariable String connectionId,
                @PathVariable String topic,
                @RequestBody UpdateKafkaTopicConfigsRequest request
        ) {
            return ApiResponse.ok(kafkaService.updateTopicConfigs(
                    connectionId,
                    topic,
                    request.retentionMs(),
                    request.retentionBytes()
            ));
        }
    
        @GetMapping("/connections/{connectionId}/kafka/topics/{topic}/messages")
        public ApiResponse<KafkaMessagesResultDto> consumeKafkaMessages(
                @PathVariable String connectionId,
                @PathVariable String topic,
                @RequestParam(required = false) Integer partition,
                @RequestParam(required = false) Long offset,
                @RequestParam(required = false) Integer limit,
                @RequestParam(required = false) Boolean fromBeginning
        ) {
            return ApiResponse.ok(kafkaService.consumeMessages(
                    connectionId, topic, partition, offset, limit, fromBeginning
            ));
        }
    
        @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EXPORT)
        @PostMapping("/connections/{connectionId}/kafka/topics/{topic}/messages")
        public ApiResponse<KafkaProduceResultDto> produceKafkaMessage(
                @PathVariable String connectionId,
                @PathVariable String topic,
                @RequestBody ProduceKafkaMessageRequest request
        ) {
            return ApiResponse.ok(kafkaService.produceMessage(
                    connectionId,
                    topic,
                    request.key(),
                    request.value(),
                    request.partition()
            ));
        }

        @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EXPORT)
        @PostMapping("/connections/{connectionId}/kafka/publish-table")
        public ApiResponse<PublishTableToKafkaResult> publishTableToKafka(
                @PathVariable String connectionId,
                @RequestBody PublishTableToKafkaRequest request
        ) {
            return ApiResponse.ok(kafkaService.publishTable(connectionId, request));
        }
    
        @GetMapping("/connections/{connectionId}/kafka/consumer-groups")
        public ApiResponse<KafkaConsumerGroupsResultDto> listKafkaConsumerGroups(
                @PathVariable String connectionId,
                @RequestParam(required = false) String pattern,
                @RequestParam(required = false) Integer limit
        ) {
            return ApiResponse.ok(kafkaService.listConsumerGroups(connectionId, pattern, limit));
        }
    
        @GetMapping("/connections/{connectionId}/kafka/consumer-groups/{groupId}/metrics")
        public ApiResponse<KafkaConsumerGroupMetricsDto> describeKafkaConsumerGroupMetrics(
                @PathVariable String connectionId,
                @PathVariable String groupId,
                @RequestParam(required = false) String topic
        ) {
            return ApiResponse.ok(kafkaService.describeConsumerGroupMetrics(connectionId, groupId, topic));
        }

        @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS)
        @PostMapping("/connections/{connectionId}/kafka/consumer-groups/{groupId}/reset-offsets")
        public ApiResponse<KafkaMutationResultDto> resetKafkaConsumerGroupOffsets(
                @PathVariable String connectionId,
                @PathVariable String groupId,
                @RequestBody ResetKafkaConsumerGroupOffsetsRequest request
        ) {
            return ApiResponse.ok(kafkaService.resetConsumerGroupOffsets(
                    connectionId,
                    groupId,
                    request.topic(),
                    request.strategy()
            ));
        }
}
