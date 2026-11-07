package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackModuleBeanRegistrarTest {

    @Test
    void registersAndClearsSingletons() {
        GenericApplicationContext context = new GenericApplicationContext();
        context.refresh();
        PackModuleBeanRegistrar registrar = new PackModuleBeanRegistrar(context);
        AtomicReference<ClassLoader> seen = new AtomicReference<>();
        Object marker = new Object();

        registrar.bindContributors(getClass().getClassLoader(), List.of(new PackModuleContributor() {
            @Override
            public String moduleId() {
                return "pack.ai";
            }

            @Override
            public void contribute(PackModuleRegistration registration) {
                seen.set(registration.moduleClassLoader());
                registration.registerSingleton("marker", Object.class, marker);
            }
        }));

        assertSame(getClass().getClassLoader(), seen.get());
        assertEquals(List.of("packModule.pack.ai.marker"), registrar.registeredBeanNames());
        assertSame(marker, context.getBean("packModule.pack.ai.marker"));

        registrar.rebind(null);
        assertTrue(registrar.registeredBeanNames().isEmpty());
        assertTrue(!context.containsBean("packModule.pack.ai.marker"));
    }
}
