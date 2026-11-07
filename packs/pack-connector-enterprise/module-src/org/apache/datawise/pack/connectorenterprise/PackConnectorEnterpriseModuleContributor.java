package org.apache.datawise.pack.connectorenterprise;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for pack.connector.enterprise — registers health probe. */
public final class PackConnectorEnterpriseModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.connector.enterprise";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackConnectorEnterpriseHealthProbe.class, new PackConnectorEnterpriseHealthProbe());
    }
}
