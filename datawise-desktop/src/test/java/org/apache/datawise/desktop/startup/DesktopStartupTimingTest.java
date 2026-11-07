package org.apache.datawise.desktop.startup;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopStartupTimingTest {

    @BeforeEach
    void setUp() {
        DesktopStartupTiming.resetForTests();
    }

    @Test
    void recordsEachPhaseOnceAndBuildsJson() {
        DesktopStartupTiming.markCefReady();
        DesktopStartupTiming.markCefReady();
        DesktopStartupTiming.markWindowShown();
        DesktopStartupTiming.markHealthReady();

        assertTrue(DesktopStartupTiming.snapshot().containsKey("cef-ready"));
        assertTrue(DesktopStartupTiming.snapshot().containsKey("window-shown"));
        String json = DesktopStartupTiming.jsonForTests();
        assertTrue(json.contains("\"cef-ready\""));
        assertTrue(json.contains("\"window-shown\""));
        assertFalse(DesktopStartupTiming.isFlushedForTests());
    }
}
