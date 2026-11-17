package org.apache.datawise.desktop.deeplink;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DeepLinkParserTest {
    @Test
    void parsesOpenQuery() {
        JsonObject payload = DeepLinkParser.parse(
                "datawise://open?connectionId=c1&database=db&sql=select%201");
        assertNotNull(payload);
        assertEquals("c1", payload.get("connectionId").getAsString());
        assertEquals("db", payload.get("database").getAsString());
        assertEquals("select 1", payload.get("sql").getAsString());
        assertFalse(payload.has("raw"));
    }

    @Test
    void rejectsNonDatawise() {
        assertNull(DeepLinkParser.parse("https://example.com"));
    }

    @Test
    void dropsUnknownParams() {
        JsonObject payload = DeepLinkParser.parse(
                "datawise://open?connectionId=c1&evil=payload&database=db");
        assertNotNull(payload);
        assertEquals("c1", payload.get("connectionId").getAsString());
        assertEquals("db", payload.get("database").getAsString());
        assertFalse(payload.getAsJsonObject("params").has("evil"));
    }

    @Test
    void rejectsOversizedUrl() {
        String huge = "datawise://open?sql=" + "x".repeat(20_000);
        assertNull(DeepLinkParser.parse(huge));
    }

    @Test
    void malformedDoesNotEchoRaw() {
        // Illegal URI form after scheme rewrite still must not leak the input.
        assertNull(DeepLinkParser.parse("datawise://[bad"));
    }

    @Test
    void dropsOversizedWhitelistedParam() {
        JsonObject payload = DeepLinkParser.parse(
                "datawise://open?connectionId=" + "c".repeat(200) + "&database=db");
        assertNotNull(payload);
        assertFalse(payload.has("connectionId"));
        assertEquals("db", payload.get("database").getAsString());
        assertTrue(payload.getAsJsonObject("params").entrySet().stream()
                .noneMatch(e -> "connectionId".equals(e.getKey())));
    }
}
