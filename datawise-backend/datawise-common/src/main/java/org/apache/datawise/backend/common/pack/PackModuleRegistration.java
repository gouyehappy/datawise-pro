package org.apache.datawise.backend.common.pack;

/**
 * Registration facade passed to {@link PackModuleContributor#contribute}.
 */
public interface PackModuleRegistration {

    ClassLoader moduleClassLoader();

    /**
     * Registers a singleton bean owned by this pack module.
     * Bean name is prefixed with {@code packModule.&lt;moduleId&gt;.} by the host.
     */
    <T> void registerSingleton(String name, Class<T> type, T instance);
}
