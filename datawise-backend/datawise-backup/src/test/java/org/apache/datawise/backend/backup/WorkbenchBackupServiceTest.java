package org.apache.datawise.backend.backup;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.backup.model.BackupRun;
import org.apache.datawise.backend.backup.model.RestoreJob;
import org.apache.datawise.backend.config.BackupProperties;
import org.apache.datawise.backend.config.StorageProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkbenchBackupServiceTest {

    @TempDir
    Path configRoot;

    private ConfigDirectoryService configDirectory;
    private WorkbenchBackupService backupService;
    private WorkbenchRestoreService restoreService;
    private AtomicReference<String> importedXml;

    @BeforeEach
    void setUp() throws Exception {
        configDirectory = new ConfigDirectoryService(configRoot);
        Files.createDirectories(configRoot.resolve("tenants/default"));
        Path connections = configRoot.resolve(ConfigPaths.tenantConnections("default"));
        Files.writeString(connections, """
                <?xml version="1.0" encoding="UTF-8"?>
                <datawise-connections version="1">
                  <group id="group-default" label="Default" sort-order="0" expanded="true">
                    <connection id="conn-1" name="Local" db-type="sqlite" sort-order="0">
                      <host></host>
                      <port>0</port>
                      <database>test.db</database>
                    </connection>
                  </group>
                </datawise-connections>
                """, StandardCharsets.UTF_8);

        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        BackupProperties backupProperties = new BackupProperties();
        BackupArtifactStore artifactStore = new BackupArtifactStore(configDirectory, backupProperties, objectMapper);
        StorageProperties storageProperties = new StorageProperties();
        backupService = new WorkbenchBackupService(
                configDirectory, storageProperties, artifactStore, emptyProvider(), emptyProvider());
        importedXml = new AtomicReference<>();
        restoreService = new WorkbenchRestoreService(
                configDirectory,
                stubConnectionStore(importedXml),
                artifactStore,
                storageProperties,
                emptyProvider()
        );
    }

    @Test
    void jdbcMemoryH2AddsPortabilityWarning() throws Exception {
        StorageProperties jdbcMem = new StorageProperties();
        jdbcMem.setBackend("jdbc");
        jdbcMem.getDatasource().setJdbcUrl("jdbc:h2:mem:workbench_backup_test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        BackupArtifactStore artifactStore = new BackupArtifactStore(
                configDirectory, new BackupProperties(), objectMapper);
        WorkbenchBackupService jdbcBackup = new WorkbenchBackupService(
                configDirectory, jdbcMem, artifactStore, emptyProvider(), emptyProvider());

        BackupRun run = new BackupRun();
        run.setId("run-mem");
        run.setTrigger(BackupRun.TRIGGER_MANUAL);
        run.setCreatedByUserId(1L);
        BackupPolicy policy = new BackupPolicy();
        policy.setType(BackupPolicy.TYPE_WORKBENCH);
        var result = jdbcBackup.backup("default", run, policy, configRoot.resolve("backups"), () -> false, p -> {
        });

        assertEquals(1, result.manifest().getWarnings().size());
        assertTrue(result.manifest().getWarnings().get(0).contains("in-memory H2"));
        assertTrue(result.manifest().getWorkbench().getPaths().stream()
                .noneMatch(p -> p.startsWith("metadata/")));
    }

    @Test
    void backupCreatesManifestAndArchive() throws Exception {
        var result = runBackup("run-test");
        assertTrue(Files.exists(result.artifactDir().resolve(BackupArtifactStore.MANIFEST_FILE)));
        assertTrue(Files.exists(result.artifactDir().resolve(BackupArtifactStore.WORKBENCH_ARCHIVE)));
        assertFalse(ZipArchiveSupport.listEntryNames(result.artifactDir().resolve(BackupArtifactStore.WORKBENCH_ARCHIVE))
                .stream()
                .anyMatch(name -> name.contains(".datawise-master-key")));
    }

    @Test
    void restoreConnectionsOnlyImportsXml() throws Exception {
        var result = runBackup("run-restore");
        Files.deleteIfExists(configRoot.resolve(ConfigPaths.tenantConnections("default")));

        RestoreJob job = new RestoreJob();
        job.setMode(RestoreJob.MODE_CONNECTIONS_ONLY);
        restoreService.restore(result.artifactDir(), job, p -> {
        });

        assertNotNull(importedXml.get());
        assertTrue(importedXml.get().contains("conn-1"));
    }

    private WorkbenchBackupService.WorkbenchBackupResult runBackup(String runId) throws Exception {
        BackupRun run = new BackupRun();
        run.setId(runId);
        run.setTrigger(BackupRun.TRIGGER_MANUAL);
        run.setCreatedByUserId(1L);
        BackupPolicy policy = new BackupPolicy();
        policy.setType(BackupPolicy.TYPE_WORKBENCH);
        return backupService.backup(
                "default",
                run,
                policy,
                configRoot.resolve("backups"),
                () -> false,
                p -> {
                }
        );
    }

    private static <T> ObjectProvider<T> emptyProvider() {
        return new ObjectProvider<>() {
            @Override
            public T getObject(Object... args) {
                return null;
            }

            @Override
            public T getObject() {
                return null;
            }

            @Override
            public T getIfAvailable() {
                return null;
            }

            @Override
            public T getIfAvailable(java.util.function.Supplier<T> defaultSupplier) {
                return defaultSupplier.get();
            }

            @Override
            public void ifAvailable(Consumer<T> dependencyConsumer) {
            }

            @Override
            public T getIfUnique() {
                return null;
            }

            @Override
            public T getIfUnique(java.util.function.Supplier<T> defaultSupplier) {
                return defaultSupplier.get();
            }

            @Override
            public void ifUnique(Consumer<T> dependencyConsumer) {
            }
        };
    }

    private static ConnectionStore stubConnectionStore(AtomicReference<String> importedXml) {
        return new ConnectionStore() {
            @Override
            public void ensureTenantFiles(String tenantId) {
            }

            @Override
            public Path connectionsFilePath() {
                return Path.of("connections.xml");
            }

            @Override
            public String readConnectionsXml() {
                return "";
            }

            @Override
            public List<ConnectionGroupEntity> findAllGroups() {
                return List.of();
            }

            @Override
            public List<ConnectionEntity> findAllConnections() {
                return List.of();
            }

            @Override
            public List<ConnectionGroupEntity> findRootGroups() {
                return List.of();
            }

            @Override
            public List<ConnectionGroupEntity> findChildGroups(String parentId) {
                return List.of();
            }

            @Override
            public void replaceAll(List<ConnectionGroupEntity> groups, List<ConnectionEntity> connections) {
            }

            @Override
            public void importConnectionsXml(String xml) {
                importedXml.set(xml);
            }

            @Override
            public Optional<ConnectionGroupEntity> findGroupById(String groupId) {
                return Optional.empty();
            }

            @Override
            public ConnectionGroupEntity saveGroup(ConnectionGroupEntity group) {
                return group;
            }

            @Override
            public void deleteGroupById(String groupId) {
            }

            @Override
            public Optional<ConnectionEntity> findConnectionById(String connectionId) {
                return Optional.empty();
            }

            @Override
            public List<ConnectionEntity> findConnectionsByGroupId(String groupId) {
                return List.of();
            }

            @Override
            public ConnectionEntity saveConnection(ConnectionEntity connection) {
                return connection;
            }

            @Override
            public void deleteConnectionById(String connectionId) {
            }

            @Override
            public int migratePlaintextSecretsIfNeeded() {
                return 0;
            }
        };
    }
}
