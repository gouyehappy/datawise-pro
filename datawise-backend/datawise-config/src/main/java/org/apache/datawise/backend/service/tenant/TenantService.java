package org.apache.datawise.backend.service.tenant;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.CreateTenantRequest;
import org.apache.datawise.backend.domain.InviteTenantMemberRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.TenantMemberDto;
import org.apache.datawise.backend.domain.TenantSummaryDto;
import org.apache.datawise.backend.domain.UpdateTenantStatusRequest;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.apache.datawise.backend.domain.tenant.TenantLifecycleListener;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
public class TenantService {

    private static final Pattern SLUG_PATTERN = Pattern.compile("^[a-z0-9][a-z0-9-]{1,31}$");

    private final TenantStore tenantStore;
    private final UserStore userStore;
    private final TenancyProperties tenancyProperties;
    private final PlatformAdminPolicy platformAdminPolicy;
    private final UserAccessPolicy userAccessPolicy;
    private final TenantBootstrapService tenantBootstrapService;
    private final List<TenantLifecycleListener> lifecycleListeners;

    public TenantService(
                         TenantStore tenantStore,
                         UserStore userStore,
                         TenancyProperties tenancyProperties,
                         PlatformAdminPolicy platformAdminPolicy,
                         UserAccessPolicy userAccessPolicy,
                         TenantBootstrapService tenantBootstrapService,
                         List<TenantLifecycleListener> lifecycleListeners) {
        this.tenantStore = tenantStore;
        this.userStore = userStore;
        this.tenancyProperties = tenancyProperties;
        this.platformAdminPolicy = platformAdminPolicy;
        this.userAccessPolicy = userAccessPolicy;
        this.tenantBootstrapService = tenantBootstrapService;
        this.lifecycleListeners = lifecycleListeners != null ? List.copyOf(lifecycleListeners) : List.of();
    }

    public List<TenantSummaryDto> listMyTenants() {
        Long userId = userAccessPolicy.requireUserId();
        if (userAccessPolicy.isGuestSession()) {
            return List.of(guestDefaultSummary());
        }
        return listActiveSummariesForUser(userId);
    }

    public List<TenantSummaryDto> listAllTenantsForPlatform() {
        platformAdminPolicy.requirePlatformAdmin();
        return tenantStore.listTenants().stream()
                .filter(t -> t != null && !"deleted".equalsIgnoreCase(nullToActive(t.getStatus())))
                .map(t -> toSummary(t, List.of()))
                .toList();
    }

    public TenantSummaryDto createTenant(CreateTenantRequest request) {
        requireMultiMode();
        if (!tenancyProperties.isAllowTenantCreate()) {
            platformAdminPolicy.requirePlatformAdmin();
        } else {
            userAccessPolicy.requireRegisteredUser();
        }
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("TENANT_NAME_REQUIRED");
        }
        String slug = normalizeSlug(request.slug(), request.name());
        if (TenantIds.DEFAULT.equals(slug)) {
            throw new IllegalArgumentException("TENANT_SLUG_RESERVED");
        }
        if (tenantStore.findTenantById(slug).isPresent() || findBySlug(slug).isPresent()) {
            throw new IllegalArgumentException("TENANT_SLUG_EXISTS");
        }
        Instant now = Instant.now();
        TenantEntity tenant = new TenantEntity();
        tenant.setId(slug);
        tenant.setSlug(slug);
        tenant.setName(request.name().trim());
        tenant.setStatus("active");
        tenant.setCreatedAt(now);
        tenant.setUpdatedAt(now);
        tenantStore.saveTenant(tenant);
        tenantBootstrapService.ensureSystemRoles(slug);

        Long adminUserId = request.adminUserId() != null
                ? request.adminUserId()
                : UserContext.requireUserId();
        UserEntity admin = userStore.findById(adminUserId)
                .orElseThrow(() -> new IllegalArgumentException("TENANT_ADMIN_NOT_FOUND"));
        if (admin.isGuest()) {
            throw new IllegalArgumentException("TENANT_ADMIN_GUEST_FORBIDDEN");
        }
        UserTenantMembership membership = new UserTenantMembership();
        membership.setUserId(adminUserId);
        membership.setTenantId(slug);
        membership.setStatus("active");
        membership.setJoinedAt(now);
        membership.setRoleIds(List.of(TenantIds.ROLE_ID_TENANT_ADMIN));
        tenantStore.saveMembership(membership);
        for (TenantLifecycleListener listener : lifecycleListeners) {
            listener.afterTenantCreated(slug);
        }
        return toSummary(tenant, List.of(TenantIds.ROLE_TENANT_ADMIN));
    }

    public TenantSummaryDto updateStatus(String tenantId, UpdateTenantStatusRequest request) {
        platformAdminPolicy.requirePlatformAdmin();
        requireMultiMode();
        if (request == null || request.status() == null || request.status().isBlank()) {
            throw new IllegalArgumentException("TENANT_STATUS_REQUIRED");
        }
        String status = request.status().trim().toLowerCase(Locale.ROOT);
        if (!List.of("active", "suspended", "deleted").contains(status)) {
            throw new IllegalArgumentException("TENANT_STATUS_INVALID");
        }
        String id = TenantIds.normalizeOrDefault(tenantId);
        if (TenantIds.DEFAULT.equals(id) && "deleted".equals(status)) {
            throw new IllegalArgumentException("TENANT_DEFAULT_DELETE_FORBIDDEN");
        }
        TenantEntity tenant = tenantStore.findTenantById(id)
                .orElseThrow(() -> new IllegalArgumentException("TENANT_NOT_FOUND"));
        tenant.setStatus(status);
        tenant.setUpdatedAt(Instant.now());
        tenantStore.saveTenant(tenant);
        return toSummary(tenant, List.of());
    }

    public TenantSummaryDto inviteMember(String tenantId, InviteTenantMemberRequest request) {
        userAccessPolicy.requireRegisteredUser();
        String id = TenantIds.normalizeOrDefault(tenantId);
        requireActiveTenant(id);
        requireMemberManager(id);
        if (request == null) {
            throw new IllegalArgumentException("TENANT_REQUEST_REQUIRED");
        }
        UserEntity user = resolveInviteUser(request);
        if (user.isGuest()) {
            throw new IllegalArgumentException("TENANT_GUEST_JOIN_FORBIDDEN");
        }
        List<String> roleIds = resolveRoleIds(id, request.roleKeys());
        Instant now = Instant.now();
        UserTenantMembership membership = tenantStore.findMembership(user.getId(), id)
                .orElseGet(UserTenantMembership::new);
        membership.setUserId(user.getId());
        membership.setTenantId(id);
        membership.setStatus("active");
        if (membership.getJoinedAt() == null) {
            membership.setJoinedAt(now);
        }
        membership.setRoleIds(roleIds);
        tenantStore.saveMembership(membership);
        TenantEntity tenant = tenantStore.findTenantById(id).orElseThrow();
        return toSummary(tenant, roleKeysForMembership(membership));
    }

    public List<TenantMemberDto> listMembers(String tenantId) {
        userAccessPolicy.requireRegisteredUser();
        String id = TenantIds.normalizeOrDefault(tenantId);
        if (tenantStore.findTenantById(id).isEmpty()) {
            throw new IllegalArgumentException("TENANT_NOT_FOUND");
        }
        requireMemberManager(id);
        List<TenantMemberDto> out = new ArrayList<>();
        for (UserTenantMembership membership : tenantStore.listMemberships(id)) {
            if (membership == null || membership.getUserId() == null) {
                continue;
            }
            if (!"active".equalsIgnoreCase(nullToActive(membership.getStatus()))) {
                continue;
            }
            String username = userStore.findById(membership.getUserId())
                    .map(UserEntity::getUsername)
                    .orElse("user-" + membership.getUserId());
            out.add(new TenantMemberDto(
                    membership.getUserId(),
                    username,
                    nullToActive(membership.getStatus()),
                    roleKeysForMembership(membership),
                    membership.getJoinedAt()));
        }
        out.sort((a, b) -> Long.compare(a.userId(), b.userId()));
        return out;
    }

    public void removeMember(String tenantId, long userId) {
        userAccessPolicy.requireRegisteredUser();
        String id = TenantIds.normalizeOrDefault(tenantId);
        requireActiveTenant(id);
        requireMemberManager(id);
        UserTenantMembership membership = tenantStore.findMembership(userId, id)
                .orElseThrow(() -> new IllegalArgumentException("TENANT_MEMBERSHIP_NOT_FOUND"));
        if (isTenantAdminMembership(id, membership) && countTenantAdmins(id) <= 1) {
            throw new IllegalArgumentException("TENANT_LAST_ADMIN");
        }
        tenantStore.removeMembership(userId, id);
    }

    public List<TenantSummaryDto> listActiveSummariesForUser(long userId) {
        List<TenantSummaryDto> out = new ArrayList<>();
        for (UserTenantMembership membership : tenantStore.listMembershipsForUser(userId)) {
            if (!"active".equalsIgnoreCase(nullToActive(membership.getStatus()))) {
                continue;
            }
            Optional<TenantEntity> tenant = tenantStore.findTenantById(membership.getTenantId());
            if (tenant.isEmpty()) {
                continue;
            }
            if (!"active".equalsIgnoreCase(nullToActive(tenant.get().getStatus()))) {
                continue;
            }
            out.add(toSummary(tenant.get(), roleKeysForMembership(membership)));
        }
        if (out.isEmpty() && tenancyProperties.isSingleMode()) {
            out.add(guestDefaultSummary());
        }
        return out;
    }

    public void requireActiveTenant(String tenantId) {
        TenantEntity tenant = tenantStore.findTenantById(TenantIds.normalizeOrDefault(tenantId))
                .orElseThrow(() -> new IllegalArgumentException("TENANT_NOT_FOUND"));
        String status = nullToActive(tenant.getStatus());
        if ("suspended".equalsIgnoreCase(status)) {
            throw new IllegalArgumentException("TENANT_SUSPENDED");
        }
        if ("deleted".equalsIgnoreCase(status)) {
            throw new IllegalArgumentException("TENANT_DELETED");
        }
    }

    public boolean userCanAccessTenant(long userId, String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        Optional<TenantEntity> tenant = tenantStore.findTenantById(id);
        if (tenant.isEmpty() || !"active".equalsIgnoreCase(nullToActive(tenant.get().getStatus()))) {
            return false;
        }
        if (platformAdminPolicy.isPlatformAdmin(userId)) {
            return true;
        }
        return tenantStore.findMembership(userId, id)
                .filter(m -> "active".equalsIgnoreCase(nullToActive(m.getStatus())))
                .isPresent();
    }

    private void requireMemberManager(String tenantId) {
        Long actorId = UserContext.requireUserId();
        boolean allowed = platformAdminPolicy.isPlatformAdmin(actorId)
                || tenantStore.hasRoleKey(actorId, tenantId, TenantIds.ROLE_TENANT_ADMIN);
        if (!allowed) {
            throw new IllegalArgumentException(UserAdminPolicy.ADMIN_REQUIRED);
        }
    }

    private UserEntity resolveInviteUser(InviteTenantMemberRequest request) {
        if (request.userId() != null) {
            return userStore.findById(request.userId())
                    .orElseThrow(() -> new IllegalArgumentException("TENANT_USER_NOT_FOUND"));
        }
        if (request.username() != null && !request.username().isBlank()) {
            return userStore.findByUsername(request.username().trim())
                    .orElseThrow(() -> new IllegalArgumentException("TENANT_USER_NOT_FOUND"));
        }
        throw new IllegalArgumentException("TENANT_USER_REQUIRED");
    }

    private boolean isTenantAdminMembership(String tenantId, UserTenantMembership membership) {
        return roleKeysForMembership(membership).contains(TenantIds.ROLE_TENANT_ADMIN)
                || tenantStore.hasRoleKey(membership.getUserId(), tenantId, TenantIds.ROLE_TENANT_ADMIN);
    }

    private long countTenantAdmins(String tenantId) {
        long count = 0;
        for (UserTenantMembership membership : tenantStore.listMemberships(tenantId)) {
            if (membership == null || membership.getUserId() == null) {
                continue;
            }
            if (!"active".equalsIgnoreCase(nullToActive(membership.getStatus()))) {
                continue;
            }
            if (isTenantAdminMembership(tenantId, membership)) {
                count++;
            }
        }
        return count;
    }

    private void requireMultiMode() {
        if (!tenancyProperties.isMultiMode()) {
            throw new IllegalArgumentException("TENANCY_MULTI_REQUIRED");
        }
    }

    private Optional<TenantEntity> findBySlug(String slug) {
        return tenantStore.listTenants().stream()
                .filter(t -> slug.equals(t.getSlug()))
                .findFirst();
    }

    private List<String> resolveRoleIds(String tenantId, List<String> roleKeys) {
        List<String> keys = roleKeys == null || roleKeys.isEmpty()
                ? List.of(TenantIds.ROLE_DEVELOPER)
                : roleKeys;
        List<String> roleIds = new ArrayList<>();
        for (String key : keys) {
            if (key == null || key.isBlank()) {
                continue;
            }
            TenantRoleEntity role = tenantStore.findRoleByKey(tenantId, key.trim())
                    .orElseThrow(() -> new IllegalArgumentException("TENANT_ROLE_UNKNOWN"));
            roleIds.add(role.getId());
        }
        if (roleIds.isEmpty()) {
            throw new IllegalArgumentException("TENANT_ROLE_REQUIRED");
        }
        return roleIds;
    }

    private List<String> roleKeysForMembership(UserTenantMembership membership) {
        List<String> keys = new ArrayList<>();
        if (membership.getRoleIds() == null) {
            return keys;
        }
        for (String roleId : membership.getRoleIds()) {
            tenantStore.findRoleById(membership.getTenantId(), roleId)
                    .map(TenantRoleEntity::getKey)
                    .ifPresent(keys::add);
        }
        return keys;
    }

    private TenantSummaryDto toSummary(TenantEntity tenant, List<String> roleKeys) {
        return new TenantSummaryDto(
                tenant.getId(),
                tenant.getSlug() != null ? tenant.getSlug() : tenant.getId(),
                tenant.getName() != null ? tenant.getName() : tenant.getId(),
                nullToActive(tenant.getStatus()),
                List.copyOf(roleKeys));
    }

    private TenantSummaryDto guestDefaultSummary() {
        String id = tenancyProperties.getDefaultTenantId();
        TenantEntity tenant = tenantStore.findTenantById(id).orElse(null);
        if (tenant != null) {
            return toSummary(tenant, List.of());
        }
        return new TenantSummaryDto(id, id, "Default", "active", List.of());
    }

    private static String normalizeSlug(String slug, String name) {
        String raw = slug != null && !slug.isBlank() ? slug.trim() : name.trim();
        String normalized = raw.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9-]+", "-")
                .replaceAll("-{2,}", "-")
                .replaceAll("^-+|-+$", "");
        if (normalized.length() < 2) {
            normalized = IdGenerator.shortId("t").replace("t", "org-");
        }
        if (normalized.length() > 32) {
            normalized = normalized.substring(0, 32).replaceAll("-+$", "");
        }
        if (!SLUG_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("TENANT_SLUG_INVALID");
        }
        return normalized;
    }

    private static String nullToActive(String status) {
        return status == null || status.isBlank() ? "active" : status;
    }
}
