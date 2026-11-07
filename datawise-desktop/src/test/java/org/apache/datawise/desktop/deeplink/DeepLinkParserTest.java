package org.apache.datawise.desktop.deeplink;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class DeepLinkParserTest {
    @Test
    void parsesOpenQuery() {
        JsonObject payload = DeepLinkParser.parse(
                "datawise://open?connectionId=c1&database=db&sql=select%201");
        assertNotNull(payload);
        assertEquals("c1", payload.get("connectionId").getAsString());
        assertEquals("db", payload.get("database").getAsString());
        assertEquals("select 1", payload.get("sql").getAsString());
    }

    @Test
    void rejectsNonDatawise() {
        assertNull(DeepLinkParser.parse("https://example.com"));
    }
}
