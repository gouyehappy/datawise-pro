package org.apache.datawise.backend.server.communityplugin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.ObjectProvider;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginPackageReplaceBarrierTest {

    @Test
    void beginStopsSidecarAndBlocksUntilEnd() {
        List<String> stopped = new ArrayList<>();
        AtomicReference<CommunityPluginSidecarLifecycle> life = new AtomicReference<>(stopped::add);
        CommunityPluginPackageReplaceBarrier barrier =
                new CommunityPluginPackageReplaceBarrier(provider(life));

        barrier.begin("io.example.plugin");
        assertTrue(barrier.isInstalling("io.example.plugin"));
        assertEquals(List.of("io.example.plugin"), stopped);

        barrier.end("io.example.plugin");
        assertFalse(barrier.isInstalling("io.example.plugin"));
    }

    @Test
    void beginIsNoOpWhenLifecycleMissing() {
        AtomicReference<CommunityPluginSidecarLifecycle> life = new AtomicReference<>();
        CommunityPluginPackageReplaceBarrier barrier =
                new CommunityPluginPackageReplaceBarrier(provider(life));

        barrier.begin("io.example.plugin");
        assertTrue(barrier.isInstalling("io.example.plugin"));
        barrier.end("io.example.plugin");
        assertFalse(barrier.isInstalling("io.example.plugin"));
    }

    private static ObjectProvider<CommunityPluginSidecarLifecycle> provider(
            AtomicReference<CommunityPluginSidecarLifecycle> life
    ) {
        return new ObjectProvider<>() {
            @Override
            public CommunityPluginSidecarLifecycle getObject() throws BeansException {
                return life.get();
            }

            @Override
            public CommunityPluginSidecarLifecycle getObject(Object... args) throws BeansException {
                return life.get();
            }

            @Override
            public CommunityPluginSidecarLifecycle getIfAvailable() throws BeansException {
                return life.get();
            }

            @Override
            public CommunityPluginSidecarLifecycle getIfUnique() throws BeansException {
                return life.get();
            }
        };
    }
}
