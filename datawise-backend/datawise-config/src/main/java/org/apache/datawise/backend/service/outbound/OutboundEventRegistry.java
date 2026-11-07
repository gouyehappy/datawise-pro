package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundEvent;
import org.apache.datawise.backend.domain.OutboundEventDefinitionDto;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.domain.OutboundEventVariableDto;
import org.apache.datawise.backend.domain.OutboundWebhookChannels;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
public class OutboundEventRegistry {

    private final Map<String, Definition> definitions;

    public OutboundEventRegistry() {
        this.definitions = buildDefinitions();
    }

    public List<OutboundEventDefinitionDto> listDefinitions() {
        return definitions.values().stream().map(Definition::toDto).toList();
    }

    public Definition require(String type) {
        Definition definition = find(type);
        if (definition == null) {
            throw new IllegalArgumentException("Unsupported outbound event type: " + type);
        }
        return definition;
    }

    public Definition find(String type) {
        if (type == null || type.isBlank()) {
            return null;
        }
        return definitions.get(type.trim());
    }

    public OutboundEvent createEvent(
                                     String eventId,
                                     String type,
                                     Instant occurredAt,
                                     Map<String, Object> data,
                                     String titleOverride,
                                     String bodyOverride) {
        Definition definition = require(type);
        Instant at = occurredAt != null ? occurredAt : Instant.now();
        Map<String, Object> safeData = data != null ? new LinkedHashMap<>(data) : new LinkedHashMap<>();
        OutboundEvent scaffold = new OutboundEvent(eventId, type, at, titleOverride, bodyOverride, safeData);
        String title = firstNonBlank(titleOverride, render(definition.defaultTitleTemplate(), scaffold));
        String body = firstNonBlank(bodyOverride, render(definition.defaultBodyTemplate(), scaffold));
        return new OutboundEvent(eventId, type, at, title, body, safeData);
    }

    public String render(String template, OutboundEvent event) {
        return OutboundTemplateRenderer.render(template, event);
    }

    private static String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary.trim();
        }
        return fallback != null ? fallback.trim() : "";
    }

    private Map<String, Definition> buildDefinitions() {
        Map<String, Definition> map = new LinkedHashMap<>();
        register(map, definition(
                OutboundEventType.SCHEDULED_TASK_OK,
                "定时任务成功",
                "Scheduled task succeeded",
                "定时任务成功：{{name}}",
                "任务类型：{{type}}\n结果：{{message}}",
                true,
                vars("name", "任务名称", "Task name"),
                vars("type", "任务类型", "Task type"),
                vars("message", "结果说明", "Result message")));
        register(map, definition(
                OutboundEventType.SCHEDULED_TASK_FAILED,
                "定时任务失败",
                "Scheduled task failed",
                "定时任务失败：{{name}}",
                "任务类型：{{type}}\n失败原因：{{message}}",
                true,
                vars("name", "任务名称", "Task name"),
                vars("type", "任务类型", "Task type"),
                vars("message", "失败原因", "Failure message")));
        register(map, definition(
                OutboundEventType.INSIGHT_DIGEST,
                "洞察摘要",
                "Insight digest",
                "洞察摘要：{{name}}",
                "{{body}}",
                true,
                vars("name", "洞察任务名称", "Insight task name"),
                vars("type", "洞察任务类型", "Insight task type"),
                vars("body", "摘要正文", "Digest body")));
        register(map, definition(
                OutboundEventType.INSIGHT_ACTION,
                "洞察动作",
                "Insight action",
                "{{title}}",
                "{{body}}",
                true,
                vars("title", "动作标题", "Action title"),
                vars("body", "动作正文", "Action body")));
        register(map, definition(
                OutboundEventType.DATA_QUALITY_OK,
                "数据质量通过",
                "Data quality check passed",
                "数据质量通过：{{name}}",
                "{{message}}",
                true,
                vars("name", "规则名称", "Rule name"),
                vars("message", "结果说明", "Result message")));
        register(map, definition(
                OutboundEventType.DATA_QUALITY_FAILED,
                "数据质量失败",
                "Data quality check failed",
                "数据质量失败：{{name}}",
                "{{message}}",
                true,
                vars("name", "规则名称", "Rule name"),
                vars("message", "失败说明", "Failure message")));
        register(map, definition(
                OutboundEventType.ORCHESTRATION_TRIGGERED,
                "编排触发成功",
                "Orchestration trigger succeeded",
                "编排触发成功：{{name}}",
                "{{message}}",
                true,
                vars("name", "编排名称", "Orchestration name"),
                vars("message", "结果说明", "Result message")));
        register(map, definition(
                OutboundEventType.ORCHESTRATION_FAILED,
                "编排触发失败",
                "Orchestration trigger failed",
                "编排触发失败：{{name}}",
                "{{message}}",
                true,
                vars("name", "编排名称", "Orchestration name"),
                vars("message", "失败说明", "Failure message")));
        register(map, definition(
                OutboundEventType.AI_QUOTA_NEAR_LIMIT,
                "AI 配额临近上限",
                "AI quota near limit",
                "AI 配额临近上限",
                "租户：{{tenantId}}\n今日调用：{{calls}} / {{limit}}\n剩余：{{remaining}}",
                true,
                vars("tenantId", "租户 ID", "Tenant id"),
                vars("calls", "今日调用次数", "Calls today"),
                vars("limit", "日限额", "Daily limit"),
                vars("remaining", "剩余额度", "Remaining calls")));
        register(map, definition(
                OutboundEventType.AI_QUOTA_EXHAUSTED,
                "AI 配额已耗尽",
                "AI quota exhausted",
                "AI 配额已耗尽",
                "租户：{{tenantId}}\n今日调用：{{calls}} / {{limit}}",
                true,
                vars("tenantId", "租户 ID", "Tenant id"),
                vars("calls", "今日调用次数", "Calls today"),
                vars("limit", "日限额", "Daily limit")));
        register(map, definition(
                OutboundEventType.PROD_APPROVAL_PENDING,
                "生产审批待处理",
                "Production approval pending",
                "生产审批待处理",
                "连接：{{connectionId}}\n审批单：{{approvalId}}\n申请人：{{requesterUserId}}",
                true,
                vars("teamId", "团队 ID", "Team id"),
                vars("approvalId", "审批单 ID", "Approval id"),
                vars("connectionId", "连接 ID", "Connection id"),
                vars("requesterUserId", "申请人用户 ID", "Requester user id")));
        register(map, definition(
                OutboundEventType.PROD_APPROVAL_DECIDED,
                "生产审批已决",
                "Production approval decided",
                "生产审批{{status}}",
                "审批单：{{approvalId}}\n状态：{{status}}",
                true,
                vars("approvalId", "审批单 ID", "Approval id"),
                vars("status", "审批状态", "Approval status")));
        register(map, definition(
                OutboundEventType.SCHEMA_DRIFT_DETECTED,
                "Schema 漂移告警",
                "Schema drift detected",
                "Schema 漂移告警",
                "监控：{{monitorId}}\n漂移数量：{{driftCount}}",
                true,
                vars("monitorId", "监控 ID", "Monitor id"),
                vars("driftCount", "漂移数量", "Drift count")));
        register(map, definition(
                OutboundEventType.SCHEMA_DRIFT_CLEAN,
                "Schema 漂移恢复",
                "Schema drift cleared",
                "Schema 漂移恢复",
                "监控：{{monitorId}}\n漂移数量：{{driftCount}}",
                true,
                vars("monitorId", "监控 ID", "Monitor id"),
                vars("driftCount", "漂移数量", "Drift count")));
        register(map, definition(
                OutboundEventType.AUDIT_APPENDED,
                "审计日志写入",
                "Audit log appended",
                "审计日志写入：{{action}}",
                "{{detail}}",
                true,
                vars("teamId", "团队 ID", "Team id"),
                vars("action", "审计动作", "Audit action"),
                vars("detail", "审计详情", "Audit detail")));
        register(map, definition(
                OutboundEventType.CONNECTION_HEALTH_FAILED,
                "连接健康异常",
                "Connection health failed",
                "连接健康异常：{{name}}",
                "连接 ID：{{connectionId}}\n失败原因：{{message}}\n耗时：{{latencyMs}} ms",
                true,
                vars("connectionId", "连接 ID", "Connection id"),
                vars("name", "连接名称", "Connection name"),
                vars("message", "失败原因", "Failure message"),
                vars("latencyMs", "耗时毫秒", "Latency milliseconds")));
        register(map, definition(
                OutboundEventType.CONNECTION_CREATED,
                "数据连接已添加",
                "Connection created",
                "数据连接已添加：{{name}}",
                "连接 ID：{{connectionId}}\n类型：{{dbType}}",
                true,
                vars("connectionId", "连接 ID", "Connection id"),
                vars("name", "连接名称", "Connection name"),
                vars("dbType", "数据库类型", "Database type")));
        register(map, definition(
                OutboundEventType.CONNECTION_DELETED,
                "数据连接已删除",
                "Connection deleted",
                "数据连接已删除：{{name}}",
                "连接 ID：{{connectionId}}\n类型：{{dbType}}",
                true,
                vars("connectionId", "连接 ID", "Connection id"),
                vars("name", "连接名称", "Connection name"),
                vars("dbType", "数据库类型", "Database type")));
        register(map, definition(
                OutboundEventType.TABLE_CREATED,
                "表已创建",
                "Table created",
                "表已创建：{{tableName}}",
                "连接：{{name}}\n数据库：{{database}}\n表：{{tableName}}",
                true,
                vars("connectionId", "连接 ID", "Connection id"),
                vars("name", "连接名称", "Connection name"),
                vars("database", "数据库名", "Database"),
                vars("tableName", "表名", "Table name")));
        register(map, definition(
                OutboundEventType.TABLE_DELETED,
                "表已删除",
                "Table deleted",
                "表已删除：{{tableName}}",
                "连接：{{name}}\n数据库：{{database}}\n表：{{tableName}}",
                true,
                vars("connectionId", "连接 ID", "Connection id"),
                vars("name", "连接名称", "Connection name"),
                vars("database", "数据库名", "Database"),
                vars("tableName", "表名", "Table name")));
        register(map, definition(
                OutboundEventType.MIGRATION_JOB_COMPLETED,
                "迁移任务完成",
                "Migration job completed",
                "迁移任务完成：{{jobId}}",
                "源连接：{{sourceConnectionId}}\n目标连接：{{targetConnectionId}}\n表数量：{{tableCount}}",
                true,
                vars("jobId", "迁移任务 ID", "Migration job id"),
                vars("sourceConnectionId", "源连接 ID", "Source connection id"),
                vars("targetConnectionId", "目标连接 ID", "Target connection id"),
                vars("tableCount", "表数量", "Table count")));
        register(map, definition(
                OutboundEventType.MIGRATION_JOB_FAILED,
                "迁移任务失败",
                "Migration job failed",
                "迁移任务失败：{{jobId}}",
                "源连接：{{sourceConnectionId}}\n目标连接：{{targetConnectionId}}\n表数量：{{tableCount}}\n失败原因：{{message}}",
                true,
                vars("jobId", "迁移任务 ID", "Migration job id"),
                vars("sourceConnectionId", "源连接 ID", "Source connection id"),
                vars("targetConnectionId", "目标连接 ID", "Target connection id"),
                vars("tableCount", "表数量", "Table count"),
                vars("message", "失败原因", "Failure message")));
        register(map, definition(
                OutboundEventType.SQL_EXECUTION_FAILED,
                "SQL 执行失败",
                "SQL execution failed",
                "SQL 执行失败：{{name}}",
                "数据库：{{database}}\n失败原因：{{message}}",
                true,
                vars("connectionId", "连接 ID", "Connection id"),
                vars("name", "连接名称", "Connection name"),
                vars("database", "数据库名", "Database"),
                vars("message", "失败原因", "Failure message")));
        register(map, definition(
                OutboundEventType.SQL_PRODUCTION_BLOCKED,
                "生产写操作被拦截",
                "Production write blocked",
                "生产写操作被拦截：{{name}}",
                "连接 ID：{{connectionId}}",
                true,
                vars("connectionId", "连接 ID", "Connection id"),
                vars("name", "连接名称", "Connection name")));
        register(map, definition(
                OutboundEventType.TEAM_INVITE_PENDING,
                "团队加入待审批",
                "Team join request pending",
                "团队加入待审批：{{name}}",
                "申请人：{{message}}\n团队 ID：{{teamId}}",
                true,
                vars("teamId", "团队 ID", "Team id"),
                vars("name", "团队名称", "Team name"),
                vars("message", "申请人名称", "Requester name"),
                vars("requesterUserId", "申请人用户 ID", "Requester user id")));
        register(map, definition(
                OutboundEventType.OUTBOUND_TEST,
                "出站测试",
                "Outbound test",
                "{{title}}",
                "{{body}}",
                true,
                vars("webhookId", "Webhook ID", "Webhook id"),
                vars("webhookName", "Webhook 名称", "Webhook name"),
                vars("channel", "通道类型", "Channel"),
                vars("tenantId", "租户 ID", "Tenant id")));
        register(map, definition(
                OutboundEventType.BACKUP_OK,
                "备份成功",
                "Backup succeeded",
                "备份成功：{{name}}",
                "类型：{{type}}\n结果：{{message}}",
                true,
                vars("name", "备份名称", "Backup name"),
                vars("type", "备份类型", "Backup type"),
                vars("message", "结果说明", "Result message"),
                vars("runId", "运行 ID", "Run id"),
                vars("artifactId", "制品 ID", "Artifact id")));
        register(map, definition(
                OutboundEventType.BACKUP_FAILED,
                "备份失败",
                "Backup failed",
                "备份失败：{{name}}",
                "类型：{{type}}\n失败原因：{{message}}",
                true,
                vars("name", "备份名称", "Backup name"),
                vars("type", "备份类型", "Backup type"),
                vars("message", "失败原因", "Failure message"),
                vars("runId", "运行 ID", "Run id")));
        return Map.copyOf(map);
    }

    private static void register(Map<String, Definition> map, Definition definition) {
        map.put(definition.type(), definition);
    }

    private static Definition definition(
                                         String type,
                                         String displayNameZh,
                                         String displayNameEn,
                                         String defaultTitleTemplate,
                                         String defaultBodyTemplate,
                                         boolean recommended,
                                         Variable... variables) {
        return new Definition(
                type,
                displayNameZh,
                displayNameEn,
                defaultTitleTemplate,
                defaultBodyTemplate,
                List.of(
                        OutboundWebhookChannels.WEBHOOK,
                        OutboundWebhookChannels.FEISHU,
                        OutboundWebhookChannels.DINGTALK,
                        OutboundWebhookChannels.EMAIL,
                        OutboundWebhookChannels.GITHUB_ISSUE,
                        OutboundWebhookChannels.GITLAB_ISSUE,
                        OutboundWebhookChannels.JIRA_ISSUE),
                List.of(variables),
                recommended,
                true);
    }

    private static Variable vars(String name, String zh, String en) {
        return new Variable(name, zh, en);
    }

    public record Definition(
            String type,
            String displayNameZh,
            String displayNameEn,
            String defaultTitleTemplate,
            String defaultBodyTemplate,
            List<String> supportedChannels,
            List<Variable> variables,
            boolean recommended,
            boolean supportsMentions) {

        OutboundEventDefinitionDto toDto() {
            return new OutboundEventDefinitionDto(
                    type,
                    displayNameZh,
                    displayNameEn,
                    defaultTitleTemplate,
                    defaultBodyTemplate,
                    supportedChannels,
                    variables.stream()
                            .map(item -> new OutboundEventVariableDto(item.name(), item.descriptionZh(), item.descriptionEn()))
                            .toList(),
                    recommended,
                    supportsMentions);
        }

        public boolean supportsChannel(String channel) {
            String normalized = OutboundWebhookChannels.normalize(channel).toLowerCase(Locale.ROOT);
            return supportedChannels.stream().anyMatch(item -> normalized.equals(item.toLowerCase(Locale.ROOT)));
        }
    }

    public record Variable(String name, String descriptionZh, String descriptionEn) {
    }
}
