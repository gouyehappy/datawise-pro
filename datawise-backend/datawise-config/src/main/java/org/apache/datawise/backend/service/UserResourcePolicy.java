package org.apache.datawise.backend.service;

import org.springframework.stereotype.Service;

import java.util.EnumMap;
import java.util.Map;

/**
 * 用户资源策略：单一事实来源，裁决各资源的读写与隔离范围。
 * <p>
 * 业务层通过 {@link #canRead(UserResource)} / {@link #requireWrite(UserResource)} 访问资源，
 * 避免在 Controller/Store 中按功能散落 guest 判断。
 */
@Service
public class UserResourcePolicy {

    public enum StorageScope {
        NONE,
        SESSION_EPHEMERAL,
        USER,
        GLOBAL
    }

    public record ResourceRule(
            StorageScope serverScope,
            boolean guestReadable,
            boolean guestWritable) {
    }

    private static final Map<UserResource, ResourceRule> RULES = buildRules();

    private final UserAccessPolicy accessPolicy;

    public UserResourcePolicy(UserAccessPolicy accessPolicy) {
        this.accessPolicy = accessPolicy;
    }

    public ResourceRule rule(UserResource resource) {
        ResourceRule rule = RULES.get(resource);
        if (rule == null) {
            throw new IllegalArgumentException("Unknown resource: " + resource);
        }
        return rule;
    }

    private static Map<UserResource, ResourceRule> buildRules() {
        Map<UserResource, ResourceRule> rules = new EnumMap<>(UserResource.class);
        ResourceRule userPrivate = new ResourceRule(StorageScope.USER, false, false);
        ResourceRule userReadOnly = new ResourceRule(StorageScope.USER, true, false);
        ResourceRule sessionCatalog = new ResourceRule(StorageScope.SESSION_EPHEMERAL, true, true);
        ResourceRule globalReadOnly = new ResourceRule(StorageScope.GLOBAL, true, false);

        putAll(rules, userPrivate, UserResource.APP_CONFIG, UserResource.AI_PREFERENCES);
        putAll(
                rules,
                userReadOnly,
                UserResource.LAYOUT_MENU,
                UserResource.SQL_SNIPPETS_PERSONAL,
                UserResource.WORKSPACE_SCRIPTS,
                UserResource.WORKSPACE_USER_DATA);
        putAll(
                rules,
                userReadOnly,
                UserResource.AI_KNOWLEDGE,
                UserResource.AI_TABLE_TAGS,
                UserResource.AI_ANALYSIS_CANVAS,
                UserResource.SEMANTIC_METRICS,
                UserResource.FEDERATED_VIEWS,
                UserResource.SCHEMA_DRIFT_MONITORS,
                UserResource.SCHEDULED_TASKS,
                UserResource.TABLE_DATA_AUDIT);
        rules.put(UserResource.CONNECTION_CATALOG, sessionCatalog);
        putAll(rules, globalReadOnly, UserResource.SQL_SNIPPETS_SHARED, UserResource.UPDATER_PREFERENCES);
        rules.put(UserResource.CONNECTIONS_XML_BULK, globalReadOnly);
        return Map.copyOf(rules);
    }

    private static void putAll(
                               Map<UserResource, ResourceRule> rules,
                               ResourceRule rule,
                               UserResource... resources) {
        for (UserResource resource : resources) {
            rules.put(resource, rule);
        }
    }

    public boolean canRead(UserResource resource) {
        ResourceRule rule = rule(resource);
        if (accessPolicy.isGuestSession()) {
            return rule.guestReadable();
        }
        return true;
    }

    public boolean canWrite(UserResource resource) {
        ResourceRule rule = rule(resource);
        if (accessPolicy.isGuestSession()) {
            return rule.guestWritable();
        }
        return true;
    }

    public void requireWrite(UserResource resource) {
        if (!canWrite(resource)) {
            throw new IllegalArgumentException(UserAccessPolicy.GUEST_NOT_ALLOWED);
        }
        if (!accessPolicy.isGuestSession()) {
            accessPolicy.requireRegisteredUser();
        }
    }

    public long readUserIdFor(UserResource resource) {
        if (!canRead(resource)) {
            throw new IllegalArgumentException(UserAccessPolicy.GUEST_NOT_ALLOWED);
        }
        return accessPolicy.requireUserId();
    }

    public long requireRegisteredUserIdFor(UserResource resource) {
        requireWrite(resource);
        return accessPolicy.requireRegisteredUserId();
    }

    public String requireSessionIdFor(UserResource resource) {
        if (!canRead(resource)) {
            throw new IllegalArgumentException(UserAccessPolicy.GUEST_NOT_ALLOWED);
        }
        return accessPolicy.requireSessionId();
    }

    public boolean isGuestSession() {
        return accessPolicy.isGuestSession();
    }

    public UserAccessPolicy accessPolicy() {
        return accessPolicy;
    }
}
