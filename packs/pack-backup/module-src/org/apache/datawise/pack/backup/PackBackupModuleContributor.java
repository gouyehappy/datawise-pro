package org.apache.datawise.pack.backup;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for pack.backup — registers health probe. */
public final class PackBackupModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.backup";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackBackupHealthProbe.class, new PackBackupHealthProbe());
    }
}
