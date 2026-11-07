package org.apache.datawise.backend.domain.tenant;

/**
 * Notified after a tenant is persisted and scoped files are initialized.
 * Implemented by server-side pack entitlement bootstrap (cloud Pro trial).
 */
@FunctionalInterface
public interface TenantLifecycleListener {

    void afterTenantCreated(String tenantId);
}
