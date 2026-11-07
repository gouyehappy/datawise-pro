package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.ServiceLoader;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Discovers {@link PackModuleContributor} implementations from the pack ClassLoader
 * and registers their singletons into the live Spring context.
 */
@Component
public class PackModuleBeanRegistrar {

    private static final Logger log = LoggerFactory.getLogger(PackModuleBeanRegistrar.class);

    private final ConfigurableApplicationContext applicationContext;
    private final CopyOnWriteArrayList<String> registeredBeanNames = new CopyOnWriteArrayList<>();

    public PackModuleBeanRegistrar(ConfigurableApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    public synchronized void rebind(ClassLoader moduleLoader) {
        clearRegistered();
        if (moduleLoader == null) {
            return;
        }
        List<PackModuleContributor> contributors = new ArrayList<>();
        for (PackModuleContributor contributor : ServiceLoader.load(PackModuleContributor.class, moduleLoader)) {
            contributors.add(contributor);
        }
        bindContributors(moduleLoader, contributors);
    }

    /** Test / internal hook that skips ServiceLoader. */
    synchronized void bindContributors(ClassLoader moduleLoader, Iterable<PackModuleContributor> contributors) {
        ConfigurableListableBeanFactory beanFactory = applicationContext.getBeanFactory();
        for (PackModuleContributor contributor : contributors) {
            String moduleId = contributor.moduleId() == null || contributor.moduleId().isBlank()
                    ? "unknown"
                    : contributor.moduleId().trim();
            PackModuleRegistration registration = new PackModuleRegistration() {
                @Override
                public ClassLoader moduleClassLoader() {
                    return moduleLoader;
                }

                @Override
                public <T> void registerSingleton(String name, Class<T> type, T instance) {
                    if (name == null || name.isBlank() || instance == null) {
                        return;
                    }
                    String beanName = "packModule." + moduleId + "." + name.trim();
                    if (beanFactory.containsSingleton(beanName) || beanFactory.containsBeanDefinition(beanName)) {
                        log.warn("Pack module bean already exists, skip name={}", beanName);
                        return;
                    }
                    beanFactory.registerSingleton(beanName, instance);
                    registeredBeanNames.add(beanName);
                    log.info("Registered pack module bean name={} type={}", beanName, type.getName());
                }
            };
            try {
                contributor.contribute(registration);
            } catch (RuntimeException ex) {
                log.warn("Pack module contributor failed moduleId={}: {}", moduleId, ex.getMessage());
            }
        }
    }

    public List<String> registeredBeanNames() {
        return List.copyOf(registeredBeanNames);
    }

    private void clearRegistered() {
        ConfigurableListableBeanFactory beanFactory = applicationContext.getBeanFactory();
        if (!(beanFactory instanceof DefaultListableBeanFactory listable)) {
            registeredBeanNames.clear();
            return;
        }
        for (String beanName : List.copyOf(registeredBeanNames)) {
            try {
                if (listable.containsSingleton(beanName)) {
                    listable.destroySingleton(beanName);
                }
            } catch (RuntimeException ex) {
                log.debug("Failed to destroy pack bean {}: {}", beanName, ex.getMessage());
            }
        }
        registeredBeanNames.clear();
    }
}
