package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ProjectEntity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FileProjectStoreTest {

    @TempDir
    Path tempDir;

    @Test
    void ensureDefaultProjectCreatesIndexAndDirs() throws Exception {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        FileProjectStore store = new FileProjectStore(configDirectory, new ObjectMapper().findAndRegisterModules());

        String defaultId = store.ensureDefaultProject(TenantIds.DEFAULT);
        assertEquals(ProjectIds.DEFAULT, defaultId);

        Path index = tempDir.resolve(ConfigPaths.tenantProjectsIndex(TenantIds.DEFAULT));
        assertTrue(Files.isRegularFile(index));
        Path docs = tempDir.resolve(ConfigPaths.tenantProjectDir(TenantIds.DEFAULT, ProjectIds.DEFAULT) + "/docs");
        assertTrue(Files.isDirectory(docs));

        ProjectEntity found = store.findProject(TenantIds.DEFAULT, ProjectIds.DEFAULT).orElseThrow();
        assertEquals(ProjectIds.DEFAULT_DISPLAY_NAME, found.getName());
    }
}
