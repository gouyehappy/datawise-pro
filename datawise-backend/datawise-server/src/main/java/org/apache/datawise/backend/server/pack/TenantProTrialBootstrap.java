package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.domain.tenant.TenantLifecycleListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * §1.3 — when cloud auto-claim is enabled, grant each new tenant a Pro suite trial.
 */
@Component
public class TenantProTrialBootstrap implements TenantLifecycleListener {

    private static final Logger log = LoggerFactory.getLogger(TenantProTrialBootstrap.class);

    private final EntitlementService entitlementService;

    public TenantProTrialBootstrap(EntitlementService entitlementService) {
        this.entitlementService = entitlementService;
    }

    @Override
    public void afterTenantCreated(String tenantId) {
        try {
            entitlementService.autoClaimTenantProTrialIfEnabled(tenantId);
        } catch (RuntimeException ex) {
            log.warn("Failed to auto-claim tenant Pro trial for {}: {}", tenantId, ex.getMessage());
            throw ex;
        }
    }
}
