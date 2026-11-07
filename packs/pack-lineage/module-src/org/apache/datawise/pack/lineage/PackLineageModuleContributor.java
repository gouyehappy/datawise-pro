package org.apache.datawise.pack.lineage;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for pack.lineage — registers health probe. */
public final class PackLineageModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.lineage";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackLineageHealthProbe.class, new PackLineageHealthProbe());
    }
}
