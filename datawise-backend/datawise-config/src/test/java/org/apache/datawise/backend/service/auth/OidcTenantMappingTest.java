package org.apache.datawise.backend.service.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.OidcConfigStore.StoredOidcConfig;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.service.tenant.TenantService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OidcTenantMappingTest {

    @Mock
    private TenancyProperties tenancyProperties;
    @Mock
    private TenantStore tenantStore;
    @Mock
    private TenantService tenantService;

    @InjectMocks
    private OidcAuthService oidcAuthService;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void resolveOidcTenantId_singleModeAlwaysDefault() {
        when(tenancyProperties.isSingleMode()).thenReturn(true);
        when(tenancyProperties.getDefaultTenantId()).thenReturn(TenantIds.DEFAULT);
        StoredOidcConfig config = StoredOidcConfig.disabledDefaults();
        ObjectNode claims = mapper.createObjectNode().put("org_id", "acme");
        assertEquals(TenantIds.DEFAULT, oidcAuthService.resolveOidcTenantId(config, claims));
    }

    @Test
    void resolveOidcTenantId_mapsClaimValue() {
        when(tenancyProperties.isSingleMode()).thenReturn(false);
        StoredOidcConfig config = StoredOidcConfig.disabledDefaults();
        config.tenantClaim = "org_id";
        config.tenantClaimMap = Map.of("acme-corp", "acme");
        TenantEntity tenant = new TenantEntity();
        tenant.setId("acme");
        tenant.setStatus("active");
        when(tenantStore.findTenantById("acme")).thenReturn(Optional.of(tenant));

        ObjectNode claims = mapper.createObjectNode().put("org_id", "acme-corp");
        assertEquals("acme", oidcAuthService.resolveOidcTenantId(config, claims));
    }

    @Test
    void resolveOidcTenantId_rejectsUnmapped() {
        when(tenancyProperties.isSingleMode()).thenReturn(false);
        StoredOidcConfig config = StoredOidcConfig.disabledDefaults();
        config.tenantClaimMap = Map.of();
        when(tenantStore.findTenantById("missing")).thenReturn(Optional.empty());
        when(tenantStore.listTenants()).thenReturn(java.util.List.of());

        ObjectNode claims = mapper.createObjectNode().put("org_id", "missing");
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> oidcAuthService.resolveOidcTenantId(config, claims)
        );
        assertEquals("OIDC_TENANT_UNMAPPED", ex.getMessage());
    }
}
