package org.apache.datawise.desktop.updater;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopFrontendDistUpdaterTest {
    @Test
    void recognizesFrontendDistZipNames() {
        assertTrue(DesktopFrontendDistUpdater.isFrontendDistZipName("DataWiseCLI-4.0.2-frontend-dist.zip"));
        assertTrue(DesktopFrontendDistUpdater.isFrontendDistZipName("frontend-dist.zip"));
        assertFalse(DesktopFrontendDistUpdater.isFrontendDistZipName("DataWiseCLI-4.0.2-windows-x64.zip"));
        assertFalse(DesktopFrontendDistUpdater.isFrontendDistZipName("setup.exe"));
        assertFalse(DesktopFrontendDistUpdater.isFrontendDistZipName(null));
    }
}
