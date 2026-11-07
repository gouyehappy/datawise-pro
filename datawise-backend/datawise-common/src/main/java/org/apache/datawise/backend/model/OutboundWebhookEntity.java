package org.apache.datawise.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Per-user outbound webhook endpoint. Stored in {@code users/{id}/outbound-webhooks.json}. */
public class OutboundWebhookEntity {

    private String id;
    private String name;
    private boolean enabled = true;
    /** {@code webhook} (default), {@code feishu}, or {@code dingtalk}. */
    private String channel = "webhook";
    private String url;
    private String secret;
    private List<String> eventTypes = new ArrayList<>();
    private List<OutboundWebhookSubscriptionEntity> subscriptions = new ArrayList<>();
    private int timeoutMs = 5000;
    private boolean includeSql;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant lastSuccessAt;
    private Instant lastFailureAt;
    private String lastError;
    /** Optional user-defined message template. Null = use built-in default. */
    private String messageTemplate;
    /** @everyone for DingTalk / Feishu robots. */
    private boolean mentionAll;
    /** DingTalk atMobiles (phone numbers in the group). */
    private List<String> mentionMobiles = new ArrayList<>();
    /** DingTalk userIds / Feishu open_ids to @mention. */
    private List<String> mentionUserIds = new ArrayList<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getChannel() {
        return channel;
    }

    public void setChannel(String channel) {
        this.channel = channel;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getSecret() {
        return secret;
    }

    public void setSecret(String secret) {
        this.secret = secret;
    }

    public List<String> getEventTypes() {
        return eventTypes;
    }

    public void setEventTypes(List<String> eventTypes) {
        this.eventTypes = eventTypes != null ? eventTypes : new ArrayList<>();
    }

    public List<OutboundWebhookSubscriptionEntity> getSubscriptions() {
        return subscriptions;
    }

    public void setSubscriptions(List<OutboundWebhookSubscriptionEntity> subscriptions) {
        this.subscriptions = subscriptions != null ? subscriptions : new ArrayList<>();
    }

    public int getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(int timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    public boolean isIncludeSql() {
        return includeSql;
    }

    public void setIncludeSql(boolean includeSql) {
        this.includeSql = includeSql;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getLastSuccessAt() {
        return lastSuccessAt;
    }

    public void setLastSuccessAt(Instant lastSuccessAt) {
        this.lastSuccessAt = lastSuccessAt;
    }

    public Instant getLastFailureAt() {
        return lastFailureAt;
    }

    public void setLastFailureAt(Instant lastFailureAt) {
        this.lastFailureAt = lastFailureAt;
    }

    public String getLastError() {
        return lastError;
    }

    public void setLastError(String lastError) {
        this.lastError = lastError;
    }

    public String getMessageTemplate() {
        return messageTemplate;
    }

    public void setMessageTemplate(String messageTemplate) {
        this.messageTemplate = messageTemplate;
    }

    public boolean isMentionAll() {
        return mentionAll;
    }

    public void setMentionAll(boolean mentionAll) {
        this.mentionAll = mentionAll;
    }

    public List<String> getMentionMobiles() {
        return mentionMobiles;
    }

    public void setMentionMobiles(List<String> mentionMobiles) {
        this.mentionMobiles = mentionMobiles != null ? mentionMobiles : new ArrayList<>();
    }

    public List<String> getMentionUserIds() {
        return mentionUserIds;
    }

    public void setMentionUserIds(List<String> mentionUserIds) {
        this.mentionUserIds = mentionUserIds != null ? mentionUserIds : new ArrayList<>();
    }
}
