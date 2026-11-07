package org.apache.datawise.backend.domain.pack;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackWatermarkTest {

    @Test
    void disabledReturnsNull() {
        assertNull(PackWatermark.resolveFooter(false, null, "site", true, false));
    }

    @Test
    void trialUsesDefaultFooter() {
        String footer = PackWatermark.resolveFooter(true, "", null, true, false);
        assertEquals(PackWatermark.DEFAULT_TRIAL_FOOTER, footer);
    }

    @Test
    void licensedSiteWatermark() {
        String footer = PackWatermark.resolveFooter(true, null, "acme-1", false, true);
        assertEquals("DataWise · site acme-1", footer);
    }

    @Test
    void appendToTextAddsCommentLine() {
        String out = PackWatermark.appendToText("select 1;\n", "Trial");
        assertTrue(out.contains("-- Trial"));
    }
}
