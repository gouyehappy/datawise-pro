package org.apache.datawise.backend.service.tenant;

import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.OidcConfigStore;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.TenantRolePresets;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Phase 0：确保 default 租户、内置角色，并为已有用户补 membership（幂等）。
 */
@Component
@Order(20)
public class TenantBootstrapService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TenantBootstrapService.class);

    private final TenantStore tenantStore;
    private final UserStore userStore;
    private final TeamStore teamStore;
    private final ConnectionStore connectionStore;
    private final OidcConfigStore oidcConfigStore;
    private final TenancyProperties tenancyProperties;

    public TenantBootstrapService(
                                  TenantStore tenantStore,
                                  UserStore userStore,
                                  TeamStore teamStore,
                                  ConnectionStore connectionStore,
                                  OidcConfigStore oidcConfigStore,
                                  TenancyProperties tenancyProperties) {
        this.tenantStore = tenantStore;
        this.userStore = userStore;
        this.teamStore = teamStore;
        this.connectionStore = connectionStore;
        this.oidcConfigStore = oidcConfigStore;
        this.tenancyProperties = tenancyProperties;
    }

    @Override
    public void run(ApplicationArguments args) {
        bootstrap();
    }

    public synchronized void bootstrap() {
        String tenantId = tenancyProperties.getDefaultTenantId();
        ensureDefaultTenant(tenantId);
        ensureSystemRoles(tenantId);
        ensureMemberships(tenantId);
        stampLegacyTenantIds(tenantId);
    }

    /** 为新建租户写入内置角色与空作用域文件（幂等）。 */
    public synchronized void ensureSystemRoles(String tenantId) {
        ensureRole(tenantId, TenantIds.ROLE_ID_TENANT_ADMIN, TenantIds.ROLE_TENANT_ADMIN, "Tenant Admin",
                TenantRolePresets.tenantAdmin());
        ensureRole(tenantId, TenantIds.ROLE_ID_DEVELOPER, TenantIds.ROLE_DEVELOPER, "Developer",
                TenantRolePresets.developer());
        ensureRole(tenantId, TenantIds.ROLE_ID_ANALYST, TenantIds.ROLE_ANALYST, "Analyst",
                TenantRolePresets.analyst());
        ensureRole(tenantId, TenantIds.ROLE_ID_READONLY, TenantIds.ROLE_READONLY, "Read Only",
                TenantRolePresets.readonly());
        ensureTenantScopedFiles(tenantId);
    }

    public synchronized void ensureTenantScopedFiles(String tenantId) {
        teamStore.ensureTenantFiles(tenantId);
        connectionStore.ensureTenantFiles(tenantId);
        oidcConfigStore.ensureTenantFiles(tenantId);
    }

    private void ensureDefaultTenant(String tenantId) {
        if (tenantStore.findTenantById(tenantId).isPresent()) {
            return;
        }
        Instant now = Instant.now();
        TenantEntity tenant = new TenantEntity();
        tenant.setId(tenantId);
        tenant.setSlug(tenantId);
        tenant.setName("Default");
        tenant.setStatus("active");
        tenant.setCreatedAt(now);
        tenant.setUpdatedAt(now);
        tenantStore.saveTenant(tenant);
        log.info("Bootstrapped default tenant id={}", tenantId);
    }

    private void ensureRole(
                            String tenantId,
                            String roleId,
                            String key,
                            String name,
                            java.util.Map<String, Boolean> permissions) {
        Optional<TenantRoleEntity> existing = tenantStore.findRoleById(tenantId, roleId);
        if (existing.isPresent()) {
            TenantRoleEntity role = existing.get();
            // 系统角色权限随预设演进；自定义名称保留
            if (role.isSystem()) {
                role.setPermissions(permissions);
                tenantStore.saveRole(role);
            }
            return;
        }
        TenantRoleEntity role = new TenantRoleEntity();
        role.setId(roleId);
        role.setTenantId(tenantId);
        role.setKey(key);
        role.setName(name);
        role.setPermissions(permissions);
        role.setSystem(true);
        tenantStore.saveRole(role);
    }

    private void ensureMemberships(String tenantId) {
        List<UserEntity> registered = userStore.listRegisteredUsers().stream()
                .sorted(Comparator.comparing(UserEntity::getId))
                .toList();
        if (registered.isEmpty()) {
            return;
        }
        Long adminUserId = registered.get(0).getId();
        for (UserEntity user : registered) {
            if (tenantStore.findMembership(user.getId(), tenantId).isPresent()) {
                continue;
            }
            UserTenantMembership membership = new UserTenantMembership();
            membership.setUserId(user.getId());
            membership.setTenantId(tenantId);
            membership.setStatus("active");
            membership.setJoinedAt(Instant.now());
            if (user.getId().equals(adminUserId)) {
                membership.setRoleIds(List.of(TenantIds.ROLE_ID_TENANT_ADMIN));
            } else {
                membership.setRoleIds(List.of(TenantIds.ROLE_ID_DEVELOPER));
            }
            tenantStore.saveMembership(membership);
            log.info("Bootstrapped membership userId={} tenantId={} roles={}",
                    user.getId(), tenantId, membership.getRoleIds());
        }
    }

    private void stampLegacyTenantIds(String tenantId) {
        for (TeamEntity team : teamStore.listAllTeams()) {
            if (team.getTenantId() == null || team.getTenantId().isBlank()) {
                team.setTenantId(tenantId);
                teamStore.saveTeam(team);
            }
        }
        boolean connectionChanged = false;
        List<ConnectionGroupEntity> groups = new java.util.ArrayList<>(connectionStore.findAllGroups());
        List<ConnectionEntity> connections = new java.util.ArrayList<>(connectionStore.findAllConnections());
        for (ConnectionGroupEntity group : groups) {
            if (group.getTenantId() == null || group.getTenantId().isBlank()) {
                group.setTenantId(tenantId);
                connectionChanged = true;
            }
        }
        for (ConnectionEntity connection : connections) {
            if (connection.getTenantId() == null || connection.getTenantId().isBlank()) {
                connection.setTenantId(tenantId);
                connectionChanged = true;
            }
        }
        if (connectionChanged) {
            connectionStore.replaceAll(groups, connections);
            log.info("Stamped tenantId={} onto legacy connections/groups", tenantId);
        }
    }
}
