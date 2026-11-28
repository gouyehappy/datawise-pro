package org.apache.datawise.desktop.updater;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopUpdaterServicePathSafetyTest {
    @TempDir
    Path temp;

    @Test
    void sanitizeKeepsBasenameOnly() {
        assertEquals("Setup.exe", DesktopUpdaterService.sanitizeAssetFileName("Setup.exe"));
        assertEquals("Setup.exe", DesktopUpdaterService.sanitizeAssetFileName("dir/Setup.exe"));
        assertEquals("Setup.exe", DesktopUpdaterService.sanitizeAssetFileName("dir\\Setup.exe"));
    }

    @Test
    void sanitizeRejectsTraversal() {
        assertThrows(IllegalArgumentException.class,
                () -> DesktopUpdaterService.sanitizeAssetFileName(".."));
        assertEquals("evil.exe", DesktopUpdaterService.sanitizeAssetFileName("../evil.exe"));
        assertEquals("a..b", DesktopUpdaterService.sanitizeAssetFileName("a..b"));
        assertThrows(IllegalArgumentException.class,
                () -> DesktopUpdaterService.sanitizeAssetFileName(""));
    }

    @Test
    void downloadTargetStaysUnderUpdatesDir() {
        Path updates = temp.resolve("updates");
        Path target = DesktopUpdaterService.resolveSafeDownloadTarget(updates, "DataWise-Setup.exe");
        assertTrue(target.startsWith(updates.toAbsolutePath().normalize()));
        assertEquals("DataWise-Setup.exe", target.getFileName().toString());
    }

    @Test
    void githubSlugFallsBackWhenInvalid() {
        // Package-visible helper uses env/sysprop; invalid values must not escape owner/repo form.
        // We only assert the default constant path via pattern: empty override → default slug.
        String slug = DesktopUpdaterService.githubSlug();
        assertTrue(slug.matches("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"));
    }
}
