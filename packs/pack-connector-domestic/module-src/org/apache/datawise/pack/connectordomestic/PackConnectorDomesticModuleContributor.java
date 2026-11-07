package org.apache.datawise.pack.connectordomestic;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for pack.connector.domestic — registers health probe. */
public final class PackConnectorDomesticModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.connector.domestic";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackConnectorDomesticHealthProbe.class, new PackConnectorDomesticHealthProbe());
    }
}
