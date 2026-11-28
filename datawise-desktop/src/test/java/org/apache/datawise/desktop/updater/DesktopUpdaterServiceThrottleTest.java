package org.apache.datawise.desktop.updater;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopUpdaterServiceThrottleTest {

    @Test
    void checkIntervalIsOneHour() {
        assertEquals(60L * 60L * 1000L, DesktopUpdaterService.CHECK_INTERVAL_MS);
        assertTrue(DesktopUpdaterService.CHECK_INTERVAL_MS >= 3_600_000L);
    }
}
