package org.apache.datawise.desktop.util;

import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopFsUtilOpenExternalTest {

    @Test
    void rejectsNonHttpSchemes() {
        IOException file = assertThrows(IOException.class, () -> DesktopFsUtil.openExternal("file:///etc/passwd"));
        assertTrue(file.getMessage().contains("unsupported url scheme"));

        IOException smb = assertThrows(IOException.class, () -> DesktopFsUtil.openExternal("smb://host/share"));
        assertTrue(smb.getMessage().contains("unsupported url scheme"));

        assertThrows(IOException.class, () -> DesktopFsUtil.openExternal(""));
    }
}
