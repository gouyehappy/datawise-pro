package org.apache.datawise.desktop.updater;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopServerJarUpdaterTest {
    @Test
    void recognizesServerJarUpdateNames() {
        assertTrue(DesktopServerJarUpdater.isServerJarUpdateName("DataWiseCLI-4.0.2-server-jar.zip"));
        assertTrue(DesktopServerJarUpdater.isServerJarUpdateName("datawise-server.jar"));
        assertFalse(DesktopServerJarUpdater.isServerJarUpdateName("DataWiseCLI-4.0.2-frontend-dist.zip"));
        assertFalse(DesktopServerJarUpdater.isServerJarUpdateName(null));
    }
}
