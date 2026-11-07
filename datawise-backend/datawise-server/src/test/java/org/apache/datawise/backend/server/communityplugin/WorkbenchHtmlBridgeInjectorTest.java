package org.apache.datawise.backend.server.communityplugin;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkbenchHtmlBridgeInjectorTest {

    @Test
    void injectsBootstrapIntoHeadBeforeModuleScripts() {
        String html = "<!doctype html><html><head><title>t</title>"
                + "<script type=\"module\">window.boot=1</script></head><body></body></html>";
        byte[] out = WorkbenchHtmlBridgeInjector.injectIntoHtml(html.getBytes(StandardCharsets.UTF_8));
        String result = new String(out, StandardCharsets.UTF_8);
        assertTrue(result.contains("datawise-plugin-paint-guard"));
        assertTrue(result.contains("datawise-plugin-bridge-bootstrap"));
        assertTrue(result.contains("__dwHostBridge"));
        assertTrue(result.contains("installOpaqueStorageShim"));
        assertTrue(result.contains("__dwOpaqueLocalStorage"));
        assertTrue(result.contains("getHostInfo"));
        assertTrue(result.contains("onHostInfo"));
        assertTrue(result.contains("protocolVersion"));
        int paintAt = result.indexOf("datawise-plugin-paint-guard");
        int bootstrapAt = result.indexOf("datawise-plugin-bridge-bootstrap");
        int moduleAt = result.indexOf("type=\"module\"");
        assertTrue(paintAt > 0 && paintAt < bootstrapAt);
        assertTrue(bootstrapAt > 0 && moduleAt > bootstrapAt);
    }

    @Test
    void isIdempotent() {
        String html = "<!doctype html><html><head></head><body></body></html>";
        byte[] once = WorkbenchHtmlBridgeInjector.injectIntoHtml(html.getBytes(StandardCharsets.UTF_8));
        byte[] twice = WorkbenchHtmlBridgeInjector.injectIntoHtml(once);
        assertTrue(new String(once, StandardCharsets.UTF_8).contains("__dwHostBridge"));
        // Second pass must not duplicate the marker string beyond the first injection.
        String second = new String(twice, StandardCharsets.UTF_8);
        int first = second.indexOf("datawise-plugin-bridge-bootstrap");
        int again = second.indexOf("datawise-plugin-bridge-bootstrap", first + 1);
        assertTrue(first >= 0);
        assertFalse(again >= 0);
    }
}
