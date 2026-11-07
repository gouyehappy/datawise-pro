package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.common.support.PluginDataLayout;
import org.apache.datawise.backend.domain.TenantIds;

/**
 * {@code config/} 目录下所有配置文件名（相对 config 根目录）。
 */
public final class ConfigPaths {

    public static final String APP = "app.xml";
    public static final String WORKSPACE = "workspace.xml";
    /** Open workspace tabs / groups (per user × tenant); not embedded in app.xml. */
    public static final String WORKSPACE_SESSION = "workspace-session.json";
    /** AI LLM / embedding / RAG prefs (per user); not embedded in app.xml. */
    public static final String AI_PREFERENCES = "ai-preferences.json";
    /** Explorer UI state (per user × tenant); not embedded in app.xml. */
    public static final String EXPLORER_UI = "explorer-ui.json";
    /** Desktop window geometry (per user). */
    public static final String WINDOW = "window.json";
    /** Local-files folder history (per user). */
    public static final String LOCAL_FILES = "local-files.json";
    public static final String CONNECTIONS = "connections.xml";
    public static final String UPDATER = "updater.xml";
    public static final String SQL_SNIPPETS_SHARED = "sql-snippets.shared.xml";
    public static final String SQL_SNIPPETS_PERSONAL = "sql-snippets.personal.xml";

    public static final String USERS = "users.json";
    public static final String SESSIONS = "sessions.json";
    public static final String AUTH_SESSION_POLICY = "auth-session.json";
    public static final String API_TOKENS = "api-tokens.json";
    public static final String OIDC = "oidc.json";
    public static final String TEAMS = "teams.json";
    public static final String SQL_HISTORY = "sql-history.json";
    public static final String AI_KNOWLEDGE = "ai-knowledge.json";
    public static final String SAVED_CONSOLES = "saved-consoles.json";
    public static final String EXPORT_TASKS = "export-tasks.json";
    public static final String NOTIFICATIONS = "notifications.json";
    public static final String MIGRATION_JOBS = "migration/jobs.json";
    public static final String SHARES = "shares.json";

    public static final String SCHEMA_CACHE_DIR = "cache/schema";
    public static final String BACKUPS_DIR = "backups";
    public static final String USERS_DIR = "users";
    public static final String TENANTS_DIR = "tenants";
    public static final String TENANTS_INDEX = TENANTS_DIR + "/index.json";

    /** Extension pack state (license / trials / install registry). */
    public static final String PACKS_DIR = "packs";
    public static final String PACK_LICENSE = PACKS_DIR + "/license.json";
    public static final String PACK_TRIALS = PACKS_DIR + "/trials.json";
    public static final String PACK_INSTALLED = PACKS_DIR + "/installed.json";
    public static final String PACK_AI_FREE_USAGE = PACKS_DIR + "/ai-free-usage.json";
    public static final String PACK_AUDIT = PACKS_DIR + "/audit.json";
    public static final String PACK_HEARTBEAT = PACKS_DIR + "/heartbeat.json";

    /**
     * Community plugins ({@code .dwp}) — separate from commercial packs and JDBC connector JARs.
     * See {@code _private/docs/design/COMMUNITY_PLUGIN_PLATFORM.md}.
     */
    public static final String COMMUNITY_PLUGINS_DIR = "community-plugins";
    public static final String COMMUNITY_PLUGIN_DATA_DIR = PluginDataLayout.DIRECTORY;
    public static final String COMMUNITY_PLUGIN_REPOSITORIES = COMMUNITY_PLUGINS_DIR + "/.repositories.json";
    public static final String COMMUNITY_PLUGIN_TRUST_DIR = COMMUNITY_PLUGINS_DIR + "/.trust";
    public static final String COMMUNITY_PLUGIN_TRUST_KEYS = COMMUNITY_PLUGIN_TRUST_DIR + "/keys.json";
    public static final String COMMUNITY_PLUGIN_INSTALL_LOCK = COMMUNITY_PLUGINS_DIR + "/.install.lock";

    public static String tenantDir(String tenantId) {
        return TENANTS_DIR + "/" + sanitizeScopeKey(tenantId);
    }

    public static String tenantMeta(String tenantId) {
        return tenantDir(tenantId) + "/tenant.json";
    }

    public static String tenantRoles(String tenantId) {
        return tenantDir(tenantId) + "/roles.json";
    }

    public static String tenantMemberships(String tenantId) {
        return tenantDir(tenantId) + "/memberships.json";
    }

    public static String tenantTeams(String tenantId) {
        return tenantDir(tenantId) + "/teams.json";
    }

    public static String tenantConnections(String tenantId) {
        return tenantDir(tenantId) + "/connections.xml";
    }

    /** 租户内项目目录（index + 每项目 docs/scripts）。 */
    public static String tenantProjectsDir(String tenantId) {
        return tenantDir(tenantId) + "/projects";
    }

    public static String tenantProjectsIndex(String tenantId) {
        return tenantProjectsDir(tenantId) + "/index.json";
    }

    public static String tenantProjectDir(String tenantId, String projectId) {
        return tenantProjectsDir(tenantId) + "/" + sanitizeScopeKey(projectId);
    }

    /** 项目级连接目录文件（PW-3-04 split-connections）。 */
    public static String tenantProjectConnections(String tenantId, String projectId) {
        return tenantProjectDir(tenantId, projectId) + "/" + CONNECTIONS;
    }

    /** 统一 connections.xml 迁移后的备份名。 */
    public static final String CONNECTIONS_MIGRATED_SUFFIX = ".migrated";

    /** 用户 × 租户活动项目。 */
    public static String userActiveProject(long userId, String tenantId) {
        return userTenantFile(userId, tenantId, "active-project.json");
    }

    public static String tenantOidc(String tenantId) {
        return tenantDir(tenantId) + "/oidc.json";
    }

    public static String tenantOutboundWebhooks(String tenantId) {
        return tenantDir(tenantId) + "/outbound-webhooks.json";
    }

    public static String tenantDataQualityTemplates(String tenantId) {
        return tenantDir(tenantId) + "/data-quality-templates.json";
    }

    public static String tenantAiUsage(String tenantId) {
        return tenantDir(tenantId) + "/ai-usage.json";
    }

    /** Per-user schema tree snapshot ({@code cache/schema/u{userId}/t{tenantId}/{connectionId}.json}). */
    public static String userSchemaCache(long userId, String tenantId, String connectionId) {
        return SCHEMA_CACHE_DIR + "/u" + userId + "/t" + sanitizeScopeKey(tenantId)
                + "/" + sanitizeScopeKey(connectionId) + ".json";
    }

    /** @deprecated use {@link #userSchemaCache(long, String, String)} */
    @Deprecated
    public static String userSchemaCache(long userId, String connectionId) {
        return userSchemaCache(userId, TenantIds.DEFAULT, connectionId);
    }

    private ConfigPaths() {
    }

    public static String userDir(long userId) {
        return USERS_DIR + "/" + userId;
    }

    /** 用户 × 租户工作区目录（不含 app.xml）。 */
    public static String userTenantDir(long userId, String tenantId) {
        return userDir(userId) + "/tenants/" + sanitizeScopeKey(tenantId);
    }

    public static String userTenantFile(long userId, String tenantId, String fileName) {
        return userTenantDir(userId, tenantId) + "/" + fileName;
    }

    public static String userTenantScopeFile(long userId, String tenantId, String dirName, String scopeKey) {
        return userTenantDir(userId, tenantId) + "/" + dirName + "/" + sanitizeScopeKey(scopeKey) + ".json";
    }

    /** 用户全局偏好（主题/布局/LLM 等），不随租户切换。 */
    public static String userAppConfig(long userId) {
        return userDir(userId) + "/app.xml";
    }

    /** User-global AI preferences (not tenant-scoped). */
    public static String userAiPreferences(long userId) {
        return userDir(userId) + "/" + AI_PREFERENCES;
    }

    /** User-global window geometry. */
    public static String userWindow(long userId) {
        return userDir(userId) + "/" + WINDOW;
    }

    /** User-global local-files folder history. */
    public static String userLocalFiles(long userId) {
        return userDir(userId) + "/" + LOCAL_FILES;
    }

    public static String userSqlSnippetsPersonal(long userId, String tenantId) {
        return userTenantFile(userId, tenantId, SQL_SNIPPETS_PERSONAL);
    }

    /** @deprecated use {@link #userSqlSnippetsPersonal(long, String)} */
    @Deprecated
    public static String userSqlSnippetsPersonal(long userId) {
        return userDir(userId) + "/" + SQL_SNIPPETS_PERSONAL;
    }

    public static String userAiKnowledge(long userId, String tenantId) {
        return userTenantFile(userId, tenantId, AI_KNOWLEDGE);
    }

    @Deprecated
    public static String userAiKnowledge(long userId) {
        return userDir(userId) + "/" + AI_KNOWLEDGE;
    }

    public static String userAnalysisCanvas(long userId, String tenantId) {
        return userTenantFile(userId, tenantId, "analysis-canvas.json");
    }

    @Deprecated
    public static String userAnalysisCanvas(long userId) {
        return userDir(userId) + "/analysis-canvas.json";
    }

    public static String userSemanticMetrics(long userId, String tenantId) {
        return userTenantFile(userId, tenantId, "semantic-metrics.json");
    }

    @Deprecated
    public static String userSemanticMetrics(long userId) {
        return userDir(userId) + "/semantic-metrics.json";
    }

    public static String userFederatedViews(long userId, String tenantId) {
        return userTenantFile(userId, tenantId, "federated-views.json");
    }

    @Deprecated
    public static String userFederatedViews(long userId) {
        return userDir(userId) + "/federated-views.json";
    }

    public static String userSchemaDriftMonitors(long userId, String tenantId) {
        return userTenantFile(userId, tenantId, "schema-drift-monitors.json");
    }

    @Deprecated
    public static String userSchemaDriftMonitors(long userId) {
        return userDir(userId) + "/schema-drift-monitors.json";
    }

    public static String userScheduledTasks(long userId, String tenantId) {
        return userTenantFile(userId, tenantId, "scheduled-tasks.json");
    }

    @Deprecated
    public static String userScheduledTasks(long userId) {
        return userDir(userId) + "/scheduled-tasks.json";
    }

    public static String userOutboundWebhooks(long userId) {
        return userDir(userId) + "/outbound-webhooks.json";
    }

    public static String userAiTableTags(long userId, String tenantId) {
        return userTenantFile(userId, tenantId, "ai-table-tags.json");
    }

    @Deprecated
    public static String userAiTableTags(long userId) {
        return userDir(userId) + "/ai-table-tags.json";
    }

    public static String userQueryLibraryVersions(long userId, String tenantId) {
        return userTenantFile(userId, tenantId, "query-library-versions.json");
    }

    @Deprecated
    public static String userQueryLibraryVersions(long userId) {
        return userDir(userId) + "/query-library-versions.json";
    }

    public static String userTableDataAuditDir(long userId, String tenantId) {
        return userTenantDir(userId, tenantId) + "/table-data-audit";
    }

    @Deprecated
    public static String userTableDataAuditDir(long userId) {
        return userDir(userId) + "/table-data-audit";
    }

    public static String userTableDataAuditScope(long userId, String tenantId, String scopeKey) {
        return userTenantScopeFile(userId, tenantId, "table-data-audit", scopeKey);
    }

    @Deprecated
    public static String userTableDataAuditScope(long userId, String scopeKey) {
        return userTableDataAuditDir(userId) + "/" + sanitizeScopeKey(scopeKey) + ".json";
    }

    public static String userSshScriptRecordsDir(long userId, String tenantId) {
        return userTenantDir(userId, tenantId) + "/ssh-script-records";
    }

    @Deprecated
    public static String userSshScriptRecordsDir(long userId) {
        return userDir(userId) + "/ssh-script-records";
    }

    public static String userSshScriptRecordsScope(long userId, String tenantId, String connectionId) {
        return userTenantScopeFile(userId, tenantId, "ssh-script-records", connectionId);
    }

    @Deprecated
    public static String userSshScriptRecordsScope(long userId, String connectionId) {
        return userSshScriptRecordsDir(userId) + "/" + sanitizeScopeKey(connectionId) + ".json";
    }

    public static String tenantSqlSnippetsShared(String tenantId) {
        return tenantDir(tenantId) + "/" + SQL_SNIPPETS_SHARED;
    }

    public static String tenantBackupPolicies(String tenantId) {
        return tenantDir(tenantId) + "/backup-policies.json";
    }

    public static String tenantBackupRuns(String tenantId) {
        return tenantDir(tenantId) + "/backup-runs.json";
    }

    public static String tenantRestoreJobs(String tenantId) {
        return tenantDir(tenantId) + "/restore-jobs.json";
    }

    /** Per-tenant pack entitlement (§1.3 cloud Pro trial). Site-level {@link #PACKS_DIR} remains legacy fallback. */
    public static String tenantPacksDir(String tenantId) {
        return tenantDir(tenantId) + "/" + PACKS_DIR;
    }

    public static String tenantPackLicense(String tenantId) {
        return tenantPacksDir(tenantId) + "/license.json";
    }

    public static String tenantPackTrials(String tenantId) {
        return tenantPacksDir(tenantId) + "/trials.json";
    }

    public static String tenantPackInstalled(String tenantId) {
        return tenantPacksDir(tenantId) + "/installed.json";
    }

    private static String sanitizeScopeKey(String value) {
        if (value == null || value.isBlank()) {
            return "default";
        }
        return value.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
