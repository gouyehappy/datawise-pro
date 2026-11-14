/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.datawise.backend.backup;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.datawise.backend.backup.model.BackupManifest;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.backup.model.BackupRun;
import org.apache.datawise.backend.backup.model.RestoreJob;
import org.apache.datawise.backend.config.BackupProperties;
import org.apache.datawise.backend.config.StorageProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * End-to-end integration test for the workbench backup artifact contract.
 *
 * <p>Drives the real {@link WorkbenchBackupService} into a real artifact directory and then
 * feeds that artifact back through {@link WorkbenchRestoreService}. The point is the trust
 * boundary between an artifact on disk and the config directory: a modified archive or a
 * re-typed manifest must be rejected before a single file is copied back.
 */
class WorkbenchBackupRestoreIT {

    private static final String CONNECTIONS_XML = """
            <?xml version="1.0" encoding="UTF-8"?>
            <datawise-connections version="1">
              <group id="group-default" label="Default" sort-order="0" expanded="true">
                <connection id="conn-1" name="Local" db-type="sqlite" sort-order="0">
                  <host></host>
                  <port>0</port>
                  <database>it.db</database>
                </connection>
              </group>
            </datawise-connections>
            """;

    @TempDir
    Path configRoot;

    private ConfigDirectoryService configDirectory;
    private BackupArtifactStore artifactStore;
    private WorkbenchBackupService backupService;
    private WorkbenchRestoreService restoreService;

    @BeforeEach
    void setUp() throws IOException {
        configDirectory = new ConfigDirectoryService(configRoot);
        Path connections = configRoot.resolve(ConfigPaths.tenantConnections("default"));
        Files.createDirectories(connections.getParent());
        Files.writeString(connections, CONNECTIONS_XML, StandardCharsets.UTF_8);
        Files.writeString(
                configRoot.resolve(ConfigPaths.USERS),
                "[{\"id\":1,\"username\":\"admin\",\"guest\":false}]",
                StandardCharsets.UTF_8);

        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        artifactStore = new BackupArtifactStore(configDirectory, new BackupProperties(), objectMapper);
        StorageProperties storageProperties = new StorageProperties();
        backupService = new WorkbenchBackupService(
                configDirectory, storageProperties, artifactStore, emptyProvider(), emptyProvider());
        restoreService = new WorkbenchRestoreService(
                configDirectory,
                mock(ConnectionStore.class),
                artifactStore,
                storageProperties,
                emptyProvider());
    }

    @Test
    void tamperedArchiveIsRejectedBeforeRestore() throws Exception {
        Path artifactDir = runBackup("run-tamper");
        Path archive = artifactDir.resolve(BackupArtifactStore.WORKBENCH_ARCHIVE);
        Files.write(archive, new byte[]{0x00}, StandardOpenOption.APPEND);
        Files.delete(configRoot.resolve(ConfigPaths.tenantConnections("default")));

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> restoreService.restore(artifactDir, fullRestoreJob(), progress -> {
                }));
        assertTrue(error.getMessage().contains("checksum mismatch"), error.getMessage());
        assertFalse(
                Files.exists(configRoot.resolve(ConfigPaths.tenantConnections("default"))),
                "restore must not write anything after checksum failure");
    }

    @Test
    void manifestWithWrongTypeIsRejected() throws Exception {
        Path artifactDir = runBackup("run-manifest");
        BackupManifest manifest = artifactStore.readManifest(artifactDir);
        manifest.setType(BackupPolicy.TYPE_DATABASE);
        artifactStore.writeManifest(artifactDir, manifest);

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> restoreService.restore(artifactDir, fullRestoreJob(), progress -> {
                }));
        assertTrue(error.getMessage().contains("not a workbench backup"), error.getMessage());
    }

    @Test
    void fullRestoreRebuildsDeletedAndRewrittenConfigFiles() throws Exception {
        Path artifactDir = runBackup("run-full");
        Path connections = configRoot.resolve(ConfigPaths.tenantConnections("default"));
        Path users = configRoot.resolve(ConfigPaths.USERS);

        Files.delete(connections);
        Files.writeString(users, "[{\"id\":1,\"username\":\"clobbered\"}]", StandardCharsets.UTF_8);

        restoreService.restore(artifactDir, fullRestoreJob(), progress -> {
        });

        assertEquals(CONNECTIONS_XML, Files.readString(connections, StandardCharsets.UTF_8));
        assertTrue(Files.readString(users, StandardCharsets.UTF_8).contains("\"admin\""));
    }

    @Test
    void manifestListsEveryArchivedPath() throws Exception {
        Path artifactDir = runBackup("run-manifest-paths");
        BackupManifest manifest = artifactStore.readManifest(artifactDir);
        assertEquals(BackupPolicy.TYPE_WORKBENCH, manifest.getType());
        assertFalse(manifest.getWorkbench().getPaths().isEmpty());
        assertTrue(manifest.getWorkbench().getPaths().contains(ConfigPaths.USERS));
        assertTrue(manifest.getWorkbench().getPaths()
                .contains(ConfigPaths.tenantConnections("default").replace('\\', '/')));
    }

    private Path runBackup(String runId) throws Exception {
        BackupRun run = new BackupRun();
        run.setId(runId);
        run.setTrigger(BackupRun.TRIGGER_MANUAL);
        run.setCreatedByUserId(1L);
        BackupPolicy policy = new BackupPolicy();
        policy.setType(BackupPolicy.TYPE_WORKBENCH);
        return backupService
                .backup("default", run, policy, configRoot.resolve("backups"), () -> false, progress -> {
                })
                .artifactDir();
    }

    private static RestoreJob fullRestoreJob() {
        RestoreJob job = new RestoreJob();
        job.setMode(RestoreJob.MODE_FULL);
        return job;
    }

    /** Mirrors the Spring lookup for an absent optional exporter/importer. */
    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> emptyProvider() {
        return mock(ObjectProvider.class);
    }
}
