package org.apache.datawise.pack.ai;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/**
 * Sample {@link PackModuleContributor} shipped inside {@code packs/pack-ai/backend/*.jar}.
 * Host registers beans under {@code packModule.pack.ai.*}.
 */
public final class PackAiModuleContributor implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "pack.ai";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", PackAiHealthProbe.class, new PackAiHealthProbe());
    }
}
