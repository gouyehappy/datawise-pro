package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.common.support.OutboundHttpUrlPolicy;
import org.apache.datawise.backend.config.ConnectionProbeProperties;
import org.apache.datawise.backend.configstore.OutboundWebhookStore;
import org.apache.datawise.backend.domain.OutboundEvent;
import org.apache.datawise.backend.domain.OutboundEventDefinitionDto;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.domain.OutboundWebhookChannels;
import org.apache.datawise.backend.domain.OutboundWebhookDto;
import org.apache.datawise.backend.domain.OutboundWebhookSubscriptionDto;
import org.apache.datawise.backend.domain.OutboundWebhookTestResultDto;
import org.apache.datawise.backend.domain.SaveOutboundWebhookSubscriptionRequest;
import org.apache.datawise.backend.domain.SaveOutboundWebhookResultDto;
import org.apache.datawise.backend.domain.SaveOutboundWebhookRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.OutboundWebhookEntity;
import org.apache.datawise.backend.model.OutboundWebhookSubscriptionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class OutboundWebhookService {

    private static final DateTimeFormatter FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.systemDefault());
    private static final List<String> AUTO_CONFIRM_CHANNELS = List.of(
            OutboundWebhookChannels.WEBHOOK,
            OutboundWebhookChannels.FEISHU,
            OutboundWebhookChannels.DINGTALK,
            OutboundWebhookChannels.EMAIL);

    private final OutboundWebhookStore webhookStore;
    private final OutboundEventPublisher publisher;
    private final OutboundEventRegistry eventRegistry;
    private final UserAccessPolicy userAccessPolicy;
    private final UserAdminPolicy userAdminPolicy;
    private final ConnectionProbeProperties probeProperties;

    @Autowired
    public OutboundWebhookService(
                                  OutboundWebhookStore webhookStore,
                                  OutboundEventPublisher publisher,
                                  OutboundEventRegistry eventRegistry,
                                  UserAccessPolicy userAccessPolicy,
                                  UserAdminPolicy userAdminPolicy,
                                  ConnectionProbeProperties probeProperties) {
        this.webhookStore = webhookStore;
        this.publisher = publisher;
        this.eventRegistry = eventRegistry;
        this.userAccessPolicy = userAccessPolicy;
        this.userAdminPolicy = userAdminPolicy;
        this.probeProperties = probeProperties != null ? probeProperties : new ConnectionProbeProperties();
    }

    /** Test helper. */
    OutboundWebhookService(
                           OutboundWebhookStore webhookStore,
                           OutboundEventPublisher publisher,
                           OutboundEventRegistry eventRegistry,
                           UserAccessPolicy userAccessPolicy,
                           UserAdminPolicy userAdminPolicy) {
        this(webhookStore, publisher, eventRegistry, userAccessPolicy, userAdminPolicy, new ConnectionProbeProperties());
    }

    public List<OutboundWebhookDto> list() {
        userAccessPolicy.requireRegisteredUser();
        return webhookStore.listByTenantId(currentTenantId()).stream()
                .map(this::toDto)
                .toList();
    }

    public List<OutboundEventDefinitionDto> listEventDefinitions() {
        userAccessPolicy.requireRegisteredUser();
        return eventRegistry.listDefinitions();
    }

    public SaveOutboundWebhookResultDto save(SaveOutboundWebhookRequest request) {
        userAdminPolicy.requireAdminUser();
        if (request == null) {
            throw new IllegalArgumentException("request is required");
        }
        if (request.url() == null || request.url().isBlank()) {
            throw new IllegalArgumentException("url is required");
        }
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        String trimmedUrl = request.url().trim();
        OutboundHttpUrlPolicy.requireAllowedOutboundUrl(trimmedUrl, probeProperties.isAllowPrivateNetworks());
        String tenantId = currentTenantId();
        Instant now = Instant.now();
        OutboundWebhookEntity entity;
        if (request.id() != null && !request.id().isBlank()) {
            entity = webhookStore.findById(tenantId, request.id())
                    .orElseThrow(() -> new IllegalArgumentException("webhook not found"));
        } else {
            entity = new OutboundWebhookEntity();
            entity.setId(IdGenerator.shortId("hook-"));
            entity.setCreatedAt(now);
        }
        entity.setName(request.name().trim());
        entity.setUrl(trimmedUrl);
        entity.setChannel(OutboundWebhookChannels.normalize(request.channel()));
        if (request.enabled() != null) {
            entity.setEnabled(request.enabled());
        }
        if (request.secret() != null && !request.secret().isBlank()) {
            entity.setSecret(request.secret().trim());
        }
        if (request.subscriptions() != null) {
            List<OutboundWebhookSubscriptionEntity> subscriptions = OutboundWebhookSubscriptionSupport.fromRequests(
                    request.subscriptions(),
                    eventRegistry);
            entity.setSubscriptions(subscriptions);
            entity.setEventTypes(OutboundWebhookSubscriptionSupport.enabledEventTypes(subscriptions));
        } else if (request.eventTypes() != null) {
            entity.setEventTypes(new ArrayList<>(request.eventTypes()));
        }
        if (request.timeoutMs() != null) {
            entity.setTimeoutMs(Math.max(1000, Math.min(request.timeoutMs(), 30000)));
        }
        if (request.includeSql() != null) {
            entity.setIncludeSql(request.includeSql());
        }
        // null = keep existing; empty string = clear (revert to built-in default)
        if (request.messageTemplate() != null) {
            String tpl = request.messageTemplate().trim();
            entity.setMessageTemplate(tpl.isEmpty() ? null : tpl);
        }
        if (request.mentionAll() != null) {
            entity.setMentionAll(request.mentionAll());
        }
        if (request.mentionMobiles() != null) {
            entity.setMentionMobiles(OutboundWebhookSubscriptionSupport.normalizeMentionList(request.mentionMobiles()));
        }
        if (request.mentionUserIds() != null) {
            entity.setMentionUserIds(OutboundWebhookSubscriptionSupport.normalizeMentionList(request.mentionUserIds()));
        }
        entity.setUpdatedAt(now);
        OutboundWebhookEntity saved = webhookStore.save(tenantId, entity);
        if (!shouldAutoConfirm(saved)) {
            return new SaveOutboundWebhookResultDto(
                    toDto(saved),
                    false,
                    true,
                    null);
        }
        OutboundWebhookTestResultDto confirmation = sendConfirmationMessage(tenantId, saved);
        return new SaveOutboundWebhookResultDto(
                toDto(saved),
                true,
                false,
                confirmation);
    }

    public void delete(String id) {
        userAdminPolicy.requireAdminUser();
        webhookStore.delete(currentTenantId(), id);
    }

    public OutboundWebhookTestResultDto test(String id) {
        userAdminPolicy.requireAdminUser();
        String tenantId = currentTenantId();
        OutboundWebhookEntity webhook = webhookStore.findById(tenantId, id)
                .orElseThrow(() -> new IllegalArgumentException("webhook not found"));
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("webhookId", webhook.getId());
        data.put("webhookName", webhook.getName());
        data.put("channel", webhook.getChannel());
        data.put("tenantId", tenantId);
        data.put("userId", UserContext.getUserId());
        OutboundEvent event = eventRegistry.createEvent(
                IdGenerator.shortId("evt-"),
                OutboundEventType.OUTBOUND_TEST,
                Instant.now(),
                data,
                "DataWise 连通性测试",
                "Webhook 连通性验证成功，此消息由管理员手动触发。");
        OutboundEventPublisher.DeliveryResult result = publisher.deliverOnce(tenantId, webhook, event);
        return new OutboundWebhookTestResultDto(result.ok(), result.statusCode(), result.message(), result.responseBody());
    }

    private String currentTenantId() {
        return TenantIds.normalizeOrDefault(UserContext.getTenantId());
    }

    private boolean shouldAutoConfirm(OutboundWebhookEntity entity) {
        String channel = OutboundWebhookChannels.normalize(entity.getChannel());
        return AUTO_CONFIRM_CHANNELS.contains(channel);
    }

    private OutboundWebhookTestResultDto sendConfirmationMessage(String tenantId, OutboundWebhookEntity webhook) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("webhookId", webhook.getId());
        data.put("webhookName", webhook.getName());
        data.put("channel", webhook.getChannel());
        data.put("tenantId", tenantId);
        data.put("userId", UserContext.getUserId());
        OutboundEvent event = eventRegistry.createEvent(
                IdGenerator.shortId("evt-"),
                OutboundEventType.OUTBOUND_TEST,
                Instant.now(),
                data,
                "DataWise Webhook 已配置",
                "Webhook 配置已保存，此消息为自动发送的确认通知。后续事件触发时将推送到此通道。");
        OutboundEventPublisher.DeliveryResult result = publisher.deliverOnce(tenantId, webhook, event);
        return new OutboundWebhookTestResultDto(result.ok(), result.statusCode(), result.message(), result.responseBody());
    }

    private OutboundWebhookDto toDto(OutboundWebhookEntity entity) {
        return new OutboundWebhookDto(
                entity.getId(),
                entity.getName(),
                entity.isEnabled(),
                OutboundWebhookChannels.normalize(
                        entity.getChannel() != null ? entity.getChannel() : OutboundWebhookChannels.WEBHOOK),
                entity.getUrl(),
                entity.getSecret() != null && !entity.getSecret().isBlank(),
                entity.getEventTypes() != null ? List.copyOf(entity.getEventTypes()) : List.of(),
                OutboundWebhookSubscriptionSupport.toDtos(entity),
                entity.getTimeoutMs(),
                entity.isIncludeSql(),
                format(entity.getCreatedAt()),
                format(entity.getUpdatedAt()),
                format(entity.getLastSuccessAt()),
                format(entity.getLastFailureAt()),
                entity.getLastError(),
                entity.getMessageTemplate(),
                entity.isMentionAll(),
                entity.getMentionMobiles() != null ? List.copyOf(entity.getMentionMobiles()) : List.of(),
                entity.getMentionUserIds() != null ? List.copyOf(entity.getMentionUserIds()) : List.of());
    }

    private static String format(Instant instant) {
        return instant != null ? FMT.format(instant) : null;
    }

}
