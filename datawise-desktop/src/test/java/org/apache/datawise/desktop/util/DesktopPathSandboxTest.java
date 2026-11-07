package org.apache.datawise.desktop.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopPathSandboxTest {
    @TempDir
    Path temp;

    @Test
    void allowsPathsUnderRegisteredRoot() throws Exception {
        DesktopPathSandbox sandbox = new DesktopPathSandbox();
        Path root = Files.createDirectories(temp.resolve("workspace"));
        Path nested = Files.createDirectories(root.resolve("docs"));
        Path file = Files.writeString(nested.resolve("a.sql"), "select 1");

        sandbox.registerRoot(root);
        assertTrue(sandbox.isAllowed(file));
        assertTrue(sandbox.isAllowed(nested.resolve("new.txt")));
        assertFalse(sandbox.isAllowed(temp.resolve("outside.txt")));
    }

    @Test
    void oneShotAllowsExactFileOnly() throws Exception {
        DesktopPathSandbox sandbox = new DesktopPathSandbox();
        Path file = Files.writeString(temp.resolve("solo.sql"), "x");
        Path sibling = Files.writeString(temp.resolve("other.sql"), "y");
        sandbox.allowOneShot(file);
        assertTrue(sandbox.isAllowed(file));
        assertFalse(sandbox.isAllowed(sibling));
        assertEquals(file.toAbsolutePath().normalize(), sandbox.requireAllowed(file));
        assertThrows(IllegalArgumentException.class, () -> sandbox.requireAllowed(sibling));
    }

    @Test
    void rejectsEscapeOutsideRoot() throws Exception {
        DesktopPathSandbox sandbox = new DesktopPathSandbox();
        Path root = Files.createDirectories(temp.resolve("root"));
        sandbox.registerRoot(root);
        Path escape = root.resolve("..").resolve("escape.txt").toAbsolutePath().normalize();
        assertFalse(sandbox.isAllowed(escape));
    }
}
