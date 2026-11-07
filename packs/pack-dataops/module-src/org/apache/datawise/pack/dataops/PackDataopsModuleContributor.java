package org.apache.datawise.pack.dataops;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for pack.dataops — registers health probe. */
public final class PackDataopsModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.dataops";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackDataopsHealthProbe.class, new PackDataopsHealthProbe());
    }
}
