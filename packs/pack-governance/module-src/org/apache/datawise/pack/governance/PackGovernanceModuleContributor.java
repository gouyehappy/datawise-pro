package org.apache.datawise.pack.governance;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for pack.governance — registers health probe. */
public final class PackGovernanceModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.governance";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackGovernanceHealthProbe.class, new PackGovernanceHealthProbe());
    }
}
