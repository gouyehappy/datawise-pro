package org.apache.datawise.backend.startup;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopDeferredStartupTest {

    @AfterEach
    void clearProps() {
        System.clearProperty("datawise.gui");
        System.clearProperty("datawise.startup.defer-noncritical");
        System.clearProperty("spring.profiles.active");
    }

    @Test
    void shouldDeferWhenGuiTrue() {
        System.setProperty("datawise.gui", "true");
        assertTrue(DesktopDeferredStartup.shouldDefer());
    }

    @Test
    void shouldNotDeferWhenExplicitlyDisabled() {
        System.setProperty("datawise.gui", "true");
        System.setProperty("datawise.startup.defer-noncritical", "false");
        assertFalse(DesktopDeferredStartup.shouldDefer());
    }

    @Test
    void runMaybeAsyncRunsInlineWhenNotDeferring() {
        System.setProperty("datawise.startup.defer-noncritical", "false");
        AtomicBoolean ran = new AtomicBoolean(false);
        DesktopDeferredStartup.runMaybeAsync("test", () -> ran.set(true));
        assertTrue(ran.get());
    }

    @Test
    void runMaybeAsyncUsesBackgroundThreadWhenDeferring() throws Exception {
        System.setProperty("datawise.gui", "true");
        CountDownLatch latch = new CountDownLatch(1);
        String[] threadName = {""};
        DesktopDeferredStartup.runMaybeAsync("test", () -> {
            threadName[0] = Thread.currentThread().getName();
            latch.countDown();
        });
        assertTrue(latch.await(2, TimeUnit.SECONDS));
        assertTrue(threadName[0].startsWith("datawise-startup-"));
    }
}
