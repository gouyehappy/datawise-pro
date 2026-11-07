package org.apache.datawise.backend.service.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.configstore.OidcConfigStore.StoredOidcConfig;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.apache.datawise.backend.service.AuthService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OidcDirectorySyncTest {

    @Mock
    private TenantStore tenantStore;
    @Mock
    private AuthService authService;

    @InjectMocks
    private OidcAuthService oidcAuthService;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void claimValues_readsArrayAndCsv() {
        ObjectNode claims = mapper.createObjectNode();
        ArrayNode groups = claims.putArray("groups");
        groups.add("admins");
        groups.add("analysts");
        assertEquals(List.of("admins", "analysts"), OidcAuthService.claimValues(claims, "groups"));

        ObjectNode csv = mapper.createObjectNode().put("groups", "a, b");
        assertEquals(List.of("a", "b"), OidcAuthService.claimValues(csv, "groups"));
    }

    @Test
    void mapClaimValuesToRoleKeys_usesMapOrPassthrough() {
        assertEquals(
                List.of("tenant_admin"),
                OidcAuthService.mapClaimValuesToRoleKeys(
                        List.of("datawise-admins"),
                        Map.of("datawise-admins", "tenant_admin")));
        assertEquals(
                List.of("developer"),
                OidcAuthService.mapClaimValuesToRoleKeys(List.of("developer"), Map.of()));
        assertTrue(OidcAuthService.mapClaimValuesToRoleKeys(List.of("unknown"), Map.of("x", "y")).isEmpty());
    }

    @Test
    void syncOidcDirectory_updatesRolesAndReactivates() {
        UserEntity user = user(7L);
        StoredOidcConfig config = StoredOidcConfig.disabledDefaults();
        config.syncRolesFromClaim = true;
        config.roleClaim = "groups";
        config.roleClaimMap = Map.of("datawise-admins", "tenant_admin");

        UserTenantMembership membership = new UserTenantMembership();
        membership.setUserId(7L);
        membership.setTenantId("default");
        membership.setStatus("disabled");
        membership.setRoleIds(List.of("role-dev"));
        when(tenantStore.findMembership(7L, "default")).thenReturn(Optional.of(membership));

        TenantRoleEntity adminRole = new TenantRoleEntity();
        adminRole.setId("role-admin");
        adminRole.setKey("tenant_admin");
        when(tenantStore.findRoleByKey("default", "tenant_admin")).thenReturn(Optional.of(adminRole));

        ObjectNode claims = mapper.createObjectNode();
        claims.putArray("groups").add("datawise-admins");

        oidcAuthService.syncOidcDirectory(user, "default", config, claims);

        ArgumentCaptor<UserTenantMembership> captor = ArgumentCaptor.forClass(UserTenantMembership.class);
        verify(tenantStore).saveMembership(captor.capture());
        assertEquals("active", captor.getValue().getStatus());
        assertEquals(List.of("role-admin"), captor.getValue().getRoleIds());
    }

    @Test
    void syncOidcDirectory_deprovisionsWhenGroupsMissing() {
        UserEntity user = user(9L);
        StoredOidcConfig config = StoredOidcConfig.disabledDefaults();
        config.syncRolesFromClaim = true;
        config.deprovisionMissingRoleClaim = true;
        config.roleClaimMap = Map.of("datawise-admins", "tenant_admin");

        UserTenantMembership membership = new UserTenantMembership();
        membership.setUserId(9L);
        membership.setTenantId("default");
        membership.setStatus("active");
        when(tenantStore.findMembership(9L, "default")).thenReturn(Optional.of(membership));

        ObjectNode claims = mapper.createObjectNode();
        claims.putArray("groups");

        oidcAuthService.syncOidcDirectory(user, "default", config, claims);

        ArgumentCaptor<UserTenantMembership> captor = ArgumentCaptor.forClass(UserTenantMembership.class);
        verify(tenantStore).saveMembership(captor.capture());
        assertEquals("disabled", captor.getValue().getStatus());
        verify(authService).revokeSessionsForUser(9L);
    }

    private static UserEntity user(long id) {
        UserEntity user = new UserEntity();
        user.setId(id);
        user.setGuest(false);
        return user;
    }
}
