package org.apache.datawise.backend.common.truncation;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TextTruncationTest {

    @Test
    void keepsShortText() {
        TextTruncation.TruncatedText result = TextTruncation.truncateChars("select 1", 100, "preview");
        assertEquals("select 1", result.text());
        assertFalse(result.meta().truncated());
        assertEquals(8L, result.meta().originalLength());
        assertEquals(100, result.meta().limit());
        assertEquals("chars", result.meta().unit());
    }

    @Test
    void truncatesAndMarksPreviewEllipsis() {
        String raw = "x".repeat(TextTruncation.MCP_PREVIEW_SQL_MAX_CHARS + 10);
        TextTruncation.TruncatedText result = TextTruncation.truncateCharsForPreview(
                raw, TextTruncation.MCP_PREVIEW_SQL_MAX_CHARS, "preview");
        assertTrue(result.meta().truncated());
        assertEquals(TextTruncation.MCP_PREVIEW_SQL_MAX_CHARS + 1, result.text().length());
        assertTrue(result.text().endsWith("…"));
        assertEquals((long) raw.length(), result.meta().originalLength());
        assertEquals(TextTruncation.MCP_PREVIEW_SQL_MAX_CHARS, result.meta().limit());
    }
}
