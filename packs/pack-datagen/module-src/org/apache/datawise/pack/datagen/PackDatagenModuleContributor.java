package org.apache.datawise.pack.datagen;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for pack.datagen — registers health probe. */
public final class PackDatagenModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.datagen";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackDatagenHealthProbe.class, new PackDatagenHealthProbe());
    }
}
