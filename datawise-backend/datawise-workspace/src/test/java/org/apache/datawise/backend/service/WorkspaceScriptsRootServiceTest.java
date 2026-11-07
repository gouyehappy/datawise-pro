package org.apache.datawise.backend.service;

import org.apache.datawise.backend.domain.UpdateWorkspaceSettingsRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkspaceScriptsRootServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void updateSettingsResolvesRelativePathUnderWorkingDirectory() throws Exception {
        WorkspaceScriptsRootService service = new WorkspaceScriptsRootService(tempDir);

        var updated = service.updateSettings(new UpdateWorkspaceSettingsRequest("nested/scripts"));

        assertEquals("nested/scripts", updated.scriptsDir());
        assertTrue(Files.isDirectory(Path.of(updated.scriptsDirResolved())));
        assertEquals("nested/scripts", service.getSettings().scriptsDir());
    }

    @Test
    void updateSettingsRejectsRelativePathEscapingConfigRoot() {
        WorkspaceScriptsRootService service = new WorkspaceScriptsRootService(tempDir, true);

        assertThrows(
                IllegalArgumentException.class,
                () -> service.updateSettings(new UpdateWorkspaceSettingsRequest("../outside"))
        );
        assertThrows(
                IllegalArgumentException.class,
                () -> service.updateSettings(new UpdateWorkspaceSettingsRequest("nested/../../outside"))
        );
    }

    @Test
    void updateSettingsRemapsAbsolutePathOutsideWorkspaceToScripts() throws Exception {
        Path outside = tempDir.resolveSibling("outside-project-sql");
        WorkspaceScriptsRootService service = new WorkspaceScriptsRootService(tempDir, true);

        var updated = service.updateSettings(new UpdateWorkspaceSettingsRequest(outside.toString()));

        Path expected = tempDir.toAbsolutePath().normalize().resolve("scripts");
        assertEquals("scripts", updated.scriptsDir());
        assertEquals(expected, Path.of(updated.scriptsDirResolved()));
        assertTrue(Files.isDirectory(Path.of(updated.scriptsDirResolved())));
    }
}
