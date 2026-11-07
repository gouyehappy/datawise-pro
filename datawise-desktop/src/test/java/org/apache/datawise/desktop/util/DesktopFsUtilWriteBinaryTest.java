package org.apache.datawise.desktop.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;

class DesktopFsUtilWriteBinaryTest {

    @Test
    void writesDecodedBytes(@TempDir Path dir) throws Exception {
        byte[] payload = new byte[] {1, 2, 3, 4};
        Path target = dir.resolve("connections.dwprofile");
        DesktopFsUtil.writeBinaryBase64(target, Base64.getEncoder().encodeToString(payload));
        assertArrayEquals(payload, Files.readAllBytes(target));
    }
}
