package org.apache.datawise.backend.common.pack;

/**
 * SPI discovered via {@code META-INF/services/...PackModuleContributor} inside pack backend JARs.
 * Loaded by {@code PackModuleClassLoader} and registered into the Spring context.
 */
public interface PackModuleContributor {

    /** Stable id used as bean-name prefix (e.g. {@code pack.ai}). */
    String moduleId();

    void contribute(PackModuleRegistration registration);
}
