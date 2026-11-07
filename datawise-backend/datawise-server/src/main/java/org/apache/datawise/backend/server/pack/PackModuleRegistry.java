package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Loads config/packs/&lt;packId&gt;/backend/*.jar into {@link PackModuleClassLoader} on startup
 * and after each successful .dpk install, then binds {@link PackModuleBeanRegistrar}.
 */
@Component
public class PackModuleRegistry {

    private final ConfigDirectoryService configDirectory;
    private final PackModuleClassLoader moduleClassLoader;
    private final PackModuleBeanRegistrar beanRegistrar;

    public PackModuleRegistry(
            ConfigDirectoryService configDirectory,
            PackModuleClassLoader moduleClassLoader,
            PackModuleBeanRegistrar beanRegistrar
    ) {
        this.configDirectory = configDirectory;
        this.moduleClassLoader = moduleClassLoader;
        this.beanRegistrar = beanRegistrar;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        refresh();
    }

    public void refresh() {
        moduleClassLoader.refresh(configDirectory.resolve(ConfigPaths.PACKS_DIR));
        beanRegistrar.rebind(moduleClassLoader.currentLoader());
    }

    public PackModuleClassLoader classLoader() {
        return moduleClassLoader;
    }
}
