package org.apache.datawise.pack.migration;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for pack.migration — registers health probe. */
public final class PackMigrationModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.migration";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackMigrationHealthProbe.class, new PackMigrationHealthProbe());
    }
}
