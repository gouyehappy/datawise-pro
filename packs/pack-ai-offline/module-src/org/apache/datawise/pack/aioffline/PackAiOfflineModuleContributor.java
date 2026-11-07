package org.apache.datawise.pack.aioffline;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/**
 * Sample {@link PackModuleContributor} for {@code pack.ai.offline}.
 */
public final class PackAiOfflineModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.ai.offline";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackAiOfflineHealthProbe.class, new PackAiOfflineHealthProbe());
    }
}
