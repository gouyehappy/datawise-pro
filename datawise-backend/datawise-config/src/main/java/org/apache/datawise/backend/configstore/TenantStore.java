package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserTenantMembership;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Tenants, roles, memberships (file or jdbc backend). */
public interface TenantStore {

    List<TenantEntity> listTenants();

    Optional<TenantEntity> findTenantById(String tenantId);

    TenantEntity saveTenant(TenantEntity tenant);

    List<TenantRoleEntity> listRoles(String tenantId);

    Optional<TenantRoleEntity> findRoleById(String tenantId, String roleId);

    Optional<TenantRoleEntity> findRoleByKey(String tenantId, String roleKey);

    TenantRoleEntity saveRole(TenantRoleEntity role);

    void deleteRole(String tenantId, String roleId);

    void replaceRoles(String tenantId, List<TenantRoleEntity> roles);

    List<UserTenantMembership> listMemberships(String tenantId);

    Optional<UserTenantMembership> findMembership(long userId, String tenantId);

    List<UserTenantMembership> listMembershipsForUser(long userId);

    UserTenantMembership saveMembership(UserTenantMembership membership);

    void removeMembership(long userId, String tenantId);

    Optional<Map<String, Boolean>> resolveRolePermissions(long userId, String tenantId);

    boolean hasRoleKey(long userId, String tenantId, String roleKey);
}
