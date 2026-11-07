package org.apache.datawise.backend.model;

import java.util.ArrayList;
import java.util.List;

/** Per-event overrides for an outbound webhook. */
public class OutboundWebhookSubscriptionEntity {

    private String eventType;
    private boolean enabled = true;
    private String titleTemplate;
    private String bodyTemplate;
    private Boolean mentionAll;
    private List<String> mentionMobiles = new ArrayList<>();
    private List<String> mentionUserIds = new ArrayList<>();

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getTitleTemplate() {
        return titleTemplate;
    }

    public void setTitleTemplate(String titleTemplate) {
        this.titleTemplate = titleTemplate;
    }

    public String getBodyTemplate() {
        return bodyTemplate;
    }

    public void setBodyTemplate(String bodyTemplate) {
        this.bodyTemplate = bodyTemplate;
    }

    public Boolean getMentionAll() {
        return mentionAll;
    }

    public void setMentionAll(Boolean mentionAll) {
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
