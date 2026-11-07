package org.apache.datawise.pack.connectorbigdata;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for pack.connector.bigdata — registers health probe. */
public final class PackConnectorBigdataModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.connector.bigdata";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackConnectorBigdataHealthProbe.class, new PackConnectorBigdataHealthProbe());
    }
}
