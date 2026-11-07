package org.apache.datawise.backend.service.outbound;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.common.support.OutboundHttpUrlPolicy;
import org.apache.datawise.backend.config.ConnectionProbeProperties;
import org.apache.datawise.backend.configstore.OutboundWebhookStore;
import org.apache.datawise.backend.domain.OutboundEvent;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.OutboundWebhookEntity;
import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Delivers {@link OutboundEvent} to matching <strong>tenant</strong> webhooks via HTTP POST.
 * Channel failures never propagate to callers.
 */
@Service
public class OutboundEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(OutboundEventPublisher.class);
    private static final int MAX_ATTEMPTS = 3;

    private final OutboundWebhookStore webhookStore;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final OutboundEventRegistry eventRegistry;
    private final OutboundChannelRendererRegistry channelRendererRegistry;
    private final ConnectionProbeProperties probeProperties;

    @Autowired
    public OutboundEventPublisher(
                                  OutboundWebhookStore webhookStore,
                                  ObjectMapper objectMapper,
                                  OutboundEventRegistry eventRegistry,
                                  OutboundChannelRendererRegistry channelRendererRegistry,
                                  ConnectionProbeProperties probeProperties) {
        this.webhookStore = webhookStore;
        this.objectMapper = objectMapper;
        this.eventRegistry = eventRegistry;
        this.channelRendererRegistry = channelRendererRegistry;
        this.probeProperties = probeProperties != null ? probeProperties : new ConnectionProbeProperties();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    /** Test helper — private-network policy defaults to deny. */
    OutboundEventPublisher(
                           OutboundWebhookStore webhookStore,
                           ObjectMapper objectMapper,
                           OutboundEventRegistry eventRegistry,
                           OutboundChannelRendererRegistry channelRendererRegistry) {
        this(webhookStore, objectMapper, eventRegistry, channelRendererRegistry, new ConnectionProbeProperties());
    }

    /**
     * 投递到当前会话租户的 Webhook（recipients 仅保留兼容；租户级通道只投一次）。
     */
    public void publishForUsers(OutboundEvent event, Collection<Long> recipientUserIds) {
        if (event == null) {
            return;
        }
        if (recipientUserIds == null || recipientUserIds.isEmpty()) {
            return;
        }
        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        try {
            deliverToTenant(tenantId, event);
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(log, "outbound.publish tenantId=" + tenantId + " type=" + event.type(), ex);
        }
    }

    public void publishForTenant(String tenantId, OutboundEvent event) {
        if (event == null) {
            return;
        }
        try {
            deliverToTenant(TenantIds.normalizeOrDefault(tenantId), event);
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(log, "outbound.publish tenantId=" + tenantId + " type=" + event.type(), ex);
        }
    }

    /**
     * Delivers to matching tenant hooks and collects ticket browse URLs from issue-channel responses.
     */
    public List<String> publishCollectingTicketUrls(OutboundEvent event) {
        if (event == null) {
            return List.of();
        }
        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        List<String> urls = new ArrayList<>();
        try {
            List<OutboundWebhookEntity> hooks = webhookStore.listByTenantId(tenantId);
            for (OutboundWebhookEntity webhook : hooks) {
                if (!webhook.isEnabled()) {
                    continue;
                }
                if (OutboundWebhookSubscriptionSupport.resolve(webhook, event.type()) == null) {
                    continue;
                }
                DeliveryResult result = post(webhook, event, tenantId, true);
                if (!result.ok()) {
                    continue;
                }
                String url = OutboundTicketUrlSupport.extractTicketUrl(webhook.getChannel(), result.responseBody());
                if (url != null && !url.isBlank() && !urls.contains(url)) {
                    urls.add(url);
                }
            }
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(log, "outbound.publishCollectingTicketUrls tenantId=" + tenantId
                    + " type=" + event.type(), ex);
        }
        return List.copyOf(urls);
    }

    public DeliveryResult deliverOnce(String tenantId, OutboundWebhookEntity webhook, OutboundEvent event) {
        return post(webhook, event, TenantIds.normalizeOrDefault(tenantId), true, false);
    }

    /** @deprecated 使用 {@link #deliverOnce(String, OutboundWebhookEntity, OutboundEvent)} */
    @Deprecated
    public DeliveryResult deliverOnce(long userId, OutboundWebhookEntity webhook, OutboundEvent event) {
        return deliverOnce(TenantIds.DEFAULT, webhook, event);
    }

    private void deliverToTenant(String tenantId, OutboundEvent event) {
        List<OutboundWebhookEntity> hooks = webhookStore.listByTenantId(tenantId);
        for (OutboundWebhookEntity webhook : hooks) {
            if (!webhook.isEnabled()) {
                continue;
            }
            if (OutboundWebhookSubscriptionSupport.resolve(webhook, event.type()) == null) {
                continue;
            }
            DeliveryResult result = post(webhook, event, tenantId, true, true);
            if (!result.ok()) {
                log.warn(
                        "outbound.webhook delivery failed tenantId={} webhookId={} type={} status={} message={}",
                        tenantId,
                        webhook.getId(),
                        event.type(),
                        result.statusCode(),
                        result.message());
            }
        }
    }

    private DeliveryResult post(
                                OutboundWebhookEntity webhook,
                                OutboundEvent event,
                                String tenantId,
                                boolean persistStatus) {
        return post(webhook, event, tenantId, persistStatus, true);
    }

    private DeliveryResult post(
                                OutboundWebhookEntity webhook,
                                OutboundEvent event,
                                String tenantId,
                                boolean persistStatus,
                                boolean requireSubscription) {
        String url = webhook.getUrl() != null ? webhook.getUrl().trim() : "";
        if (url.isEmpty()) {
            return DeliveryResult.failed(0, "url is empty");
        }
        try {
            OutboundWebhookResolvedSubscription subscription = requireSubscription
                    ? OutboundWebhookSubscriptionSupport.resolve(webhook, event.type())
                    : OutboundWebhookSubscriptionSupport.resolveForDirectDelivery(webhook, event.type());
            if (subscription == null) {
                return DeliveryResult.failed(0, "event is not subscribed");
            }
            OutboundEvent renderedEvent = renderEvent(webhook, subscription, event);
            Map<String, Object> genericPayload = buildPayload(renderedEvent, webhook.isIncludeSql());
            OutboundPreparedRequest prepared = channelRendererRegistry.prepare(
                    new OutboundChannelRenderContext(webhook, subscription, renderedEvent, genericPayload));
            // mailto:/bare-email rewrites to DATAWISE_MAIL_WEBHOOK_URL (operator env) — allow private LAN gateways.
            boolean allowPrivate = probeProperties.isAllowPrivateNetworks()
                    || isOperatorConfiguredMailGateway(webhook.getUrl());
            OutboundHttpUrlPolicy.requireAllowedOutboundUrl(prepared.url(), allowPrivate);
            byte[] body = objectMapper.writeValueAsBytes(prepared.body());
            int timeoutMs = Math.max(1000, Math.min(webhook.getTimeoutMs() <= 0 ? 5000 : webhook.getTimeoutMs(), 30000));
            Exception lastError = null;
            for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(prepared.url()))
                            .timeout(Duration.ofMillis(timeoutMs))
                            .header("Content-Type", "application/json; charset=utf-8")
                            .header("User-Agent", "DataWise-Outbound/1.0")
                            .header("X-DataWise-Event", event.type())
                            .header("X-DataWise-Delivery", event.id())
                            .header("X-DataWise-Tenant", tenantId)
                            .POST(HttpRequest.BodyPublishers.ofByteArray(body));
                    if (prepared.extraHeaders() != null) {
                        for (Map.Entry<String, String> header : prepared.extraHeaders().entrySet()) {
                            if (header.getKey() == null || header.getKey().isBlank()
                                    || header.getValue() == null) {
                                continue;
                            }
                            builder.header(header.getKey(), header.getValue());
                        }
                    }
                    if (prepared.applyDataWiseSignature()) {
                        String signature = sign(webhook.getSecret(), body);
                        if (signature != null) {
                            builder.header("X-DataWise-Signature", "sha256=" + signature);
                        }
                    }
                    HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
                    int status = response.statusCode();
                    if (status >= 200 && status < 300) {
                        String responseBody = response.body();
                        String bizError = extractBizError(responseBody);
                        if (bizError != null) {
                            if (persistStatus) {
                                markFailure(tenantId, webhook, bizError);
                            }
                            return DeliveryResult.failed(status, bizError, responseBody);
                        }
                        if (persistStatus) {
                            markSuccess(tenantId, webhook);
                        }
                        return DeliveryResult.ok(status, responseBody);
                    }
                    lastError = new IllegalStateException("HTTP " + status);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    lastError = ex;
                    break;
                } catch (Exception ex) {
                    lastError = ex;
                    if (attempt < MAX_ATTEMPTS) {
                        try {
                            Thread.sleep(100L * attempt);
                        } catch (InterruptedException interrupted) {
                            Thread.currentThread().interrupt();
                            lastError = interrupted;
                            break;
                        }
                    }
                }
            }
            String message = lastError != null && lastError.getMessage() != null
                    ? lastError.getMessage()
                    : "delivery failed";
            if (persistStatus) {
                markFailure(tenantId, webhook, message);
            }
            return DeliveryResult.failed(0, message);
        } catch (Exception ex) {
            String message = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
            if (persistStatus) {
                markFailure(tenantId, webhook, message);
            }
            ExceptionLogging.recoverable(
                    log,
                    "outbound.webhook tenantId=" + tenantId + " webhookId=" + webhook.getId(),
                    ex);
            return DeliveryResult.failed(0, message);
        }
    }

    private Map<String, Object> buildPayload(OutboundEvent event, boolean includeSql) {
        Map<String, Object> data = event.data() != null ? new LinkedHashMap<>(event.data()) : new LinkedHashMap<>();
        if (!includeSql) {
            data.remove("sql");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", event.id());
        payload.put("type", event.type());
        payload.put("occurredAt", event.occurredAt() != null ? event.occurredAt().toString() : Instant.now().toString());
        payload.put("title", event.title());
        payload.put("body", event.body());
        payload.put("data", data);
        return payload;
    }

    private OutboundEvent renderEvent(
                                      OutboundWebhookEntity webhook,
                                      OutboundWebhookResolvedSubscription subscription,
                                      OutboundEvent event) {
        Map<String, Object> data = event.data() != null ? new LinkedHashMap<>(event.data()) : new LinkedHashMap<>();
        data.putIfAbsent("webhookId", webhook.getId());
        data.putIfAbsent("webhookName", webhook.getName());
        data.putIfAbsent("channel", webhook.getChannel());
        OutboundEvent baseEvent = eventRegistry.createEvent(
                event.id(),
                event.type(),
                event.occurredAt(),
                data,
                event.title(),
                event.body());
        String title = baseEvent.title();
        String body = baseEvent.body();
        if (subscription.titleTemplate() != null && !subscription.titleTemplate().isBlank()) {
            title = OutboundTemplateRenderer.render(subscription.titleTemplate(), baseEvent);
        }
        if (subscription.bodyTemplate() != null && !subscription.bodyTemplate().isBlank()) {
            body = OutboundTemplateRenderer.render(subscription.bodyTemplate(), baseEvent);
        }
        return new OutboundEvent(baseEvent.id(), baseEvent.type(), baseEvent.occurredAt(), title, body, data);
    }

    private static String sign(String secret, byte[] body) {
        if (secret == null || secret.isBlank()) {
            return null;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.trim().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(body));
        } catch (Exception ex) {
            return null;
        }
    }

    private void markSuccess(String tenantId, OutboundWebhookEntity webhook) {
        webhook.setLastSuccessAt(Instant.now());
        webhook.setLastError(null);
        webhook.setUpdatedAt(Instant.now());
        webhookStore.save(tenantId, webhook);
    }

    private void markFailure(String tenantId, OutboundWebhookEntity webhook, String message) {
        webhook.setLastFailureAt(Instant.now());
        webhook.setLastError(message != null && message.length() > 500 ? message.substring(0, 500) : message);
        webhook.setUpdatedAt(Instant.now());
        webhookStore.save(tenantId, webhook);
    }

    /**
     * Detects business-level errors from platforms that return HTTP 200 even on failure
     * (e.g. DingTalk, Feishu return {"errcode": 310000, "errmsg": "..."}).
     */
    static String extractBizError(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return null;
        }
        String trimmed = responseBody.trim();
        if (!trimmed.startsWith("{")) {
            return null;
        }
        try {
            // Simple check without full JSON parse: look for errcode != 0
            int errcodeIdx = trimmed.indexOf("\"errcode\"");
            if (errcodeIdx < 0) {
                return null;
            }
            int colonIdx = trimmed.indexOf(':', errcodeIdx + 9);
            if (colonIdx < 0) {
                return null;
            }
            int start = colonIdx + 1;
            while (start < trimmed.length() && Character.isWhitespace(trimmed.charAt(start))) {
                start++;
            }
            int end = start;
            while (end < trimmed.length() && (Character.isDigit(trimmed.charAt(end)) || trimmed.charAt(end) == '-')) {
                end++;
            }
            if (start >= end) {
                return null;
            }
            long errcode = Long.parseLong(trimmed.substring(start, end));
            if (errcode == 0) {
                return null;
            }
            // Try to extract errmsg
            int errmsgIdx = trimmed.indexOf("\"errmsg\"");
            if (errmsgIdx >= 0) {
                int msgColon = trimmed.indexOf(':', errmsgIdx + 8);
                if (msgColon >= 0) {
                    int msgStart = trimmed.indexOf('"', msgColon + 1);
                    int msgEnd = msgStart >= 0 ? trimmed.indexOf('"', msgStart + 1) : -1;
                    if (msgStart >= 0 && msgEnd > msgStart) {
                        String errmsg = trimmed.substring(msgStart + 1, msgEnd);
                        return "errcode=" + errcode + ": " + errmsg;
                    }
                }
            }
            return "errcode=" + errcode;
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    /**
     * mailto: / bare email addresses are rewritten to {@code DATAWISE_MAIL_WEBHOOK_URL}
     * (operator-controlled env). Private LAN mail gateways must still work under cloud SSRF policy.
     */
    static boolean isOperatorConfiguredMailGateway(String configuredWebhookUrl) {
        if (configuredWebhookUrl == null || configuredWebhookUrl.isBlank()) {
            return false;
        }
        String trimmed = configuredWebhookUrl.trim();
        String lower = trimmed.toLowerCase(java.util.Locale.ROOT);
        if (lower.startsWith("mailto:")) {
            return true;
        }
        return trimmed.indexOf('@') > 0
                && !lower.startsWith("http://")
                && !lower.startsWith("https://")
                && !trimmed.contains("://")
                && !trimmed.contains("/");
    }

    public record DeliveryResult(boolean ok, int statusCode, String message, String responseBody) {

        public static DeliveryResult ok(int statusCode) {
            return ok(statusCode, null);
        }

        public static DeliveryResult ok(int statusCode, String responseBody) {
            return new DeliveryResult(true, statusCode, "ok", responseBody);
        }

        public static DeliveryResult failed(int statusCode, String message) {
            return new DeliveryResult(false, statusCode, message, null);
        }

        public static DeliveryResult failed(int statusCode, String message, String responseBody) {
            return new DeliveryResult(false, statusCode, message, responseBody);
        }
    }
}
