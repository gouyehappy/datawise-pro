package org.apache.datawise.backend.service.project;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.FileProjectStore;
import org.apache.datawise.backend.domain.ProjectDeleteRequest;
import org.apache.datawise.backend.domain.ProjectFileContentDto;
import org.apache.datawise.backend.domain.ProjectFileEntryDto;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ProjectMkdirRequest;
import org.apache.datawise.backend.domain.ProjectRenameRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ProjectFilesServiceTest {

    @TempDir
    Path tempDir;

    private ProjectFilesService service;
    private UserAccessPolicy accessPolicy;

    @BeforeEach
    void setUp() {
        UserContext.set(1L, false, "test-session", TenantIds.DEFAULT);
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        FileProjectStore projectStore = new FileProjectStore(configDirectory, new ObjectMapper().findAndRegisterModules());
        projectStore.ensureDefaultProject(TenantIds.DEFAULT);
        accessPolicy = mock(UserAccessPolicy.class);
        ProjectService projectService = new ProjectService(
                projectStore,
                mock(),
                accessPolicy,
                configDirectory,
                mock());
        service = new ProjectFilesService(configDirectory, projectStore, projectService, accessPolicy);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void listWriteAndRejectEscape() throws Exception {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "notes/readme.md", "# hi"));
        List<ProjectFileEntryDto> top = service.list(ProjectIds.DEFAULT, "docs", "");
        assertTrue(top.stream().anyMatch(e -> e.directory() && "notes".equals(e.name())));

        List<ProjectFileEntryDto> nested = service.list(ProjectIds.DEFAULT, "docs", "notes");
        assertEquals(1, nested.size());
        assertEquals("readme.md", nested.get(0).name());

        ProjectFileContentDto read = service.read(ProjectIds.DEFAULT, "docs", "notes/readme.md");
        assertEquals("# hi", read.content());

        assertThrows(IllegalArgumentException.class,
                () -> service.read(ProjectIds.DEFAULT, "docs", "../outside.txt"));
        assertThrows(IllegalArgumentException.class,
                () -> service.list(ProjectIds.DEFAULT, "docs", "../../"));

        ProjectFileEntryDto dir = service.mkdir(ProjectIds.DEFAULT, new ProjectMkdirRequest("scripts", "queries"));
        assertTrue(dir.directory());
        verify(accessPolicy, org.mockito.Mockito.atLeastOnce()).requireRegisteredUser();
        assertTrue(Files.isDirectory(
                tempDir.resolve(ConfigPaths.tenantProjectDir(TenantIds.DEFAULT, ProjectIds.DEFAULT) + "/scripts/queries")));
    }

    @Test
    void renameFileAndRejectConflict() throws Exception {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "a.txt", "one"));
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "b.txt", "two"));

        ProjectFileEntryDto renamed = service.rename(
                ProjectIds.DEFAULT,
                new ProjectRenameRequest("docs", "a.txt", "a-renamed.txt"));
        assertEquals("a-renamed.txt", renamed.name());
        assertEquals("a-renamed.txt", renamed.path());
        assertEquals("one", service.read(ProjectIds.DEFAULT, "docs", "a-renamed.txt").content());

        assertThrows(IllegalArgumentException.class, () -> service.rename(ProjectIds.DEFAULT, new ProjectRenameRequest("docs", "a-renamed.txt", "b.txt")));
        assertThrows(IllegalArgumentException.class, () -> service.rename(ProjectIds.DEFAULT, new ProjectRenameRequest("docs", "missing.txt", "x.txt")));
    }

    @Test
    void deleteFileAndFolderRejectRoot() throws Exception {
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "notes/readme.md", "# hi"));
        service.write(ProjectIds.DEFAULT, new ProjectFileContentDto("docs", "notes/extra.md", "x"));

        service.delete(ProjectIds.DEFAULT, new ProjectDeleteRequest("docs", "notes/extra.md"));
        assertThrows(IllegalArgumentException.class,
                () -> service.read(ProjectIds.DEFAULT, "docs", "notes/extra.md"));

        service.delete(ProjectIds.DEFAULT, new ProjectDeleteRequest("docs", "notes"));
        List<ProjectFileEntryDto> top = service.list(ProjectIds.DEFAULT, "docs", "");
        assertTrue(top.stream().noneMatch(e -> "notes".equals(e.name())));

        assertThrows(IllegalArgumentException.class,
                () -> service.delete(ProjectIds.DEFAULT, new ProjectDeleteRequest("docs", ".")));
        assertThrows(IllegalArgumentException.class,
                () -> service.delete(ProjectIds.DEFAULT, new ProjectDeleteRequest("docs", "missing.md")));
    }
}
