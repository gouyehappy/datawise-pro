package org.apache.datawise.desktop.bridge;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopBridgeScriptTest {
    @Test
    void omitsTerminalAndExposesCoreFields() {
        String script = DesktopBridgeScript.build("win32", "http://127.0.0.1:18421", "4.0.1", false);
        assertTrue(script.contains("__datawiseDesktopBridge"));
        assertTrue(script.contains("apiBaseUrl"));
        assertTrue(script.contains("cefQuery"));
        assertTrue(script.contains("isPackaged"));
        assertTrue(script.contains("devtools"));
        assertTrue(script.contains("fs:"));
        assertTrue(script.contains("revealInExplorer"));
        assertTrue(script.contains("listDir"));
        assertTrue(script.contains("writeTextFile"));
        assertTrue(script.contains("selectSaveFile"));
        assertTrue(script.contains("writeBinaryFile"));
        assertTrue(script.contains("openInTerminal"));
        assertTrue(script.contains("registerRoot"));
        assertTrue(script.contains("theme:"));
        assertTrue(script.contains("datawise:file:open"));
        assertTrue(script.contains("_ackSessionFlush"));
        assertTrue(script.contains("app:sessionFlushed"));
        assertFalse(script.contains("splash:"));
        assertFalse(script.contains("terminal:"));
        assertFalse(script.contains("terminal: {"));
    }
}
