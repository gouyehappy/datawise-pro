package org.apache.datawise.pack.security;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for pack.security — registers health probe. */
public final class PackSecurityModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.security";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackSecurityHealthProbe.class, new PackSecurityHealthProbe());
    }
}
