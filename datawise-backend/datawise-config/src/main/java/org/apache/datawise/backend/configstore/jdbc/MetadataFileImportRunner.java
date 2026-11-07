package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ApiTokenStore;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.OidcConfigStore;
import org.apache.datawise.backend.configstore.OidcConfigStore.StoredOidcConfig;
import org.apache.datawise.backend.configstore.OutboundWebhookStore;
import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.configstore.SqlHistoryStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.TenantAiUsageStore;
import org.apache.datawise.backend.configstore.TenantAiUsageStore.AiUsageSnapshot;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.configstore.io.ConfigFileSupport;
import org.apache.datawise.backend.configstore.team.TeamSnapshot;
import org.apache.datawise.backend.model.ApiTokenEntity;
import org.apache.datawise.backend.model.OutboundWebhookEntity;
import org.apache.datawise.backend.model.SessionEntity;
import org.apache.datawise.backend.model.SqlHistoryEntity;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * One-shot import from file JSON into JDBC when tables are empty.
 */
@Component
@Order(5)
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class MetadataFileImportRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(MetadataFileImportRunner.class);
    private static final String IMPORT_MARKER = "file-v1";

    private final JdbcTemplate jdbc;
    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final UserStore userStore;
    private final SessionStore sessionStore;
    private final TenantStore tenantStore;
    private final ApiTokenStore apiTokenStore;
    private final TeamStore teamStore;
    private final ConnectionStore connectionStore;
    private final OidcConfigStore oidcConfigStore;
    private final OutboundWebhookStore outboundWebhookStore;
    private final TenantAiUsageStore aiUsageStore;
    private final SqlHistoryStore sqlHistoryStore;

    public MetadataFileImportRunner(
                                    @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
                                    ConfigDirectoryService configDirectory,
                                    ObjectMapper objectMapper,
                                    UserStore userStore,
                                    SessionStore sessionStore,
                                    TenantStore tenantStore,
                                    ApiTokenStore apiTokenStore,
                                    TeamStore teamStore,
                                    ConnectionStore connectionStore,
                                    OidcConfigStore oidcConfigStore,
                                    OutboundWebhookStore outboundWebhookStore,
                                    TenantAiUsageStore aiUsageStore,
                                    SqlHistoryStore sqlHistoryStore) {
        this.jdbc = jdbc;
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.userStore = userStore;
        this.sessionStore = sessionStore;
        this.tenantStore = tenantStore;
        this.apiTokenStore = apiTokenStore;
        this.teamStore = teamStore;
        this.connectionStore = connectionStore;
        this.oidcConfigStore = oidcConfigStore;
        this.outboundWebhookStore = outboundWebhookStore;
        this.aiUsageStore = aiUsageStore;
        this.sqlHistoryStore = sqlHistoryStore;
    }

    @Override
    public void run(ApplicationArguments args) {
        Integer imported = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dw_metadata_import WHERE id = ?",
                Integer.class,
                IMPORT_MARKER);
        if (imported != null && imported > 0) {
            return;
        }
        Integer userCount = jdbc.queryForObject("SELECT COUNT(*) FROM dw_users", Integer.class);
        if (userCount != null && userCount > 0) {
            markImported();
            return;
        }
        Path usersPath = configDirectory.resolve(ConfigPaths.USERS);
        if (!ConfigFileSupport.exists(usersPath)) {
            markImported();
            return;
        }
        log.info("Importing identity metadata from file backend into JDBC");
        importUsers(usersPath);
        importSessions();
        importTenants();
        importApiTokens();
        importTeams();
        importConnections();
        importOidc();
        importOutboundWebhooks();
        importAiUsage();
        importSqlHistory();
        markImported();
        log.info("Identity metadata import complete");
    }

    private void importUsers(Path usersPath) {
        List<UserEntity> users = ConfigFileSupport.readList(
                usersPath,
                objectMapper,
                new TypeReference<>() {
                });
        for (UserEntity user : users) {
            if (user != null && user.getId() != null) {
                userStore.saveUser(user);
            }
        }
    }

    private void importSessions() {
        Path path = configDirectory.resolve(ConfigPaths.SESSIONS);
        if (!ConfigFileSupport.exists(path)) {
            return;
        }
        List<SessionEntity> sessions = ConfigFileSupport.readList(path, objectMapper, new TypeReference<>() {
        });
        for (SessionEntity session : sessions) {
            if (session != null && session.getId() != null) {
                sessionStore.save(session);
            }
        }
    }

    private void importTenants() {
        Path indexPath = configDirectory.resolve(ConfigPaths.TENANTS_INDEX);
        if (!ConfigFileSupport.exists(indexPath)) {
            return;
        }
        List<TenantEntity> tenants = ConfigFileSupport.readList(indexPath, objectMapper, new TypeReference<>() {
        });
        for (TenantEntity tenant : tenants) {
            if (tenant == null || tenant.getId() == null) {
                continue;
            }
            tenantStore.saveTenant(tenant);
            Path rolesPath = configDirectory.resolve(ConfigPaths.tenantRoles(tenant.getId()));
            if (ConfigFileSupport.exists(rolesPath)) {
                List<TenantRoleEntity> roles = ConfigFileSupport.readList(
                        rolesPath, objectMapper, new TypeReference<>() {
                        });
                for (TenantRoleEntity role : roles) {
                    if (role != null) {
                        role.setTenantId(tenant.getId());
                        tenantStore.saveRole(role);
                    }
                }
            }
            Path membershipsPath = configDirectory.resolve(ConfigPaths.tenantMemberships(tenant.getId()));
            if (ConfigFileSupport.exists(membershipsPath)) {
                List<UserTenantMembership> memberships = ConfigFileSupport.readList(
                        membershipsPath, objectMapper, new TypeReference<>() {
                        });
                for (UserTenantMembership membership : memberships) {
                    if (membership != null) {
                        membership.setTenantId(tenant.getId());
                        tenantStore.saveMembership(membership);
                    }
                }
            }
        }
    }

    private void importApiTokens() {
        Path path = configDirectory.resolve(ConfigPaths.API_TOKENS);
        if (!ConfigFileSupport.exists(path)) {
            return;
        }
        List<ApiTokenEntity> tokens = ConfigFileSupport.readList(path, objectMapper, new TypeReference<>() {
        });
        for (ApiTokenEntity token : tokens) {
            if (token != null && token.getId() != null) {
                apiTokenStore.save(token);
            }
        }
    }

    private void importTeams() {
        if (!(teamStore instanceof JdbcTeamStore jdbcTeamStore)) {
            return;
        }
        for (TenantEntity tenant : tenantStore.listTenants()) {
            if (tenant == null || tenant.getId() == null) {
                continue;
            }
            Path teamsPath = configDirectory.resolve(ConfigPaths.tenantTeams(tenant.getId()));
            if (!ConfigFileSupport.exists(teamsPath)) {
                continue;
            }
            try {
                TeamSnapshot snapshot = objectMapper.readValue(teamsPath.toFile(), TeamSnapshot.class);
                jdbcTeamStore.replaceSnapshot(tenant.getId(), snapshot != null ? snapshot : TeamSnapshot.empty());
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to import teams for tenant " + tenant.getId(), ex);
            }
        }
    }

    private void importConnections() {
        if (!(connectionStore instanceof JdbcConnectionStore jdbcConnectionStore)) {
            return;
        }
        for (TenantEntity tenant : tenantStore.listTenants()) {
            if (tenant == null || tenant.getId() == null) {
                continue;
            }
            Path connectionsPath = configDirectory.resolve(ConfigPaths.tenantConnections(tenant.getId()));
            if (!ConfigFileSupport.exists(connectionsPath)) {
                continue;
            }
            try {
                String xml = java.nio.file.Files.readString(connectionsPath);
                jdbcConnectionStore.replaceXmlPayload(tenant.getId(), xml);
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to import connections for tenant " + tenant.getId(), ex);
            }
        }
    }

    private void importOidc() {
        if (!(oidcConfigStore instanceof JdbcOidcConfigStore jdbcOidc)) {
            return;
        }
        for (TenantEntity tenant : tenantStore.listTenants()) {
            if (tenant == null || tenant.getId() == null) {
                continue;
            }
            Path oidcPath = configDirectory.resolve(ConfigPaths.tenantOidc(tenant.getId()));
            if (!ConfigFileSupport.exists(oidcPath)) {
                continue;
            }
            try {
                StoredOidcConfig stored = objectMapper.readValue(oidcPath.toFile(), StoredOidcConfig.class);
                jdbcOidc.saveForTenant(tenant.getId(), stored != null ? stored : StoredOidcConfig.disabledDefaults());
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to import oidc for tenant " + tenant.getId(), ex);
            }
        }
    }

    private void importOutboundWebhooks() {
        if (!(outboundWebhookStore instanceof JdbcOutboundWebhookStore jdbcHooks)) {
            return;
        }
        for (TenantEntity tenant : tenantStore.listTenants()) {
            if (tenant == null || tenant.getId() == null) {
                continue;
            }
            Path hooksPath = configDirectory.resolve(ConfigPaths.tenantOutboundWebhooks(tenant.getId()));
            if (!ConfigFileSupport.exists(hooksPath)) {
                continue;
            }
            try {
                List<OutboundWebhookEntity> hooks = ConfigFileSupport.readList(
                        hooksPath, objectMapper, new TypeReference<>() {
                        });
                jdbcHooks.replaceAll(tenant.getId(), hooks);
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to import outbound webhooks for tenant " + tenant.getId(), ex);
            }
        }
    }

    private void importAiUsage() {
        for (TenantEntity tenant : tenantStore.listTenants()) {
            if (tenant == null || tenant.getId() == null) {
                continue;
            }
            Path usagePath = configDirectory.resolve(ConfigPaths.tenantAiUsage(tenant.getId()));
            if (!ConfigFileSupport.exists(usagePath)) {
                continue;
            }
            try {
                AiUsageSnapshot usage = objectMapper.readValue(usagePath.toFile(), AiUsageSnapshot.class);
                if (usage != null) {
                    aiUsageStore.write(tenant.getId(), usage);
                }
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to import ai usage for tenant " + tenant.getId(), ex);
            }
        }
    }

    private void importSqlHistory() {
        if (!(sqlHistoryStore instanceof JdbcSqlHistoryStore jdbcHistory)) {
            return;
        }
        Path path = configDirectory.resolve(ConfigPaths.SQL_HISTORY);
        if (!ConfigFileSupport.exists(path)) {
            return;
        }
        List<SqlHistoryEntity> entries = ConfigFileSupport.readList(path, objectMapper, new TypeReference<>() {
        });
        jdbcHistory.replaceAll(entries);
    }

    private void markImported() {
        Integer existing = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dw_metadata_import WHERE id = ?",
                Integer.class,
                IMPORT_MARKER);
        if (existing != null && existing > 0) {
            return;
        }
        jdbc.update(
                "INSERT INTO dw_metadata_import (id, imported_at) VALUES (?, ?)",
                IMPORT_MARKER,
                Timestamp.from(Instant.now()));
    }
}
