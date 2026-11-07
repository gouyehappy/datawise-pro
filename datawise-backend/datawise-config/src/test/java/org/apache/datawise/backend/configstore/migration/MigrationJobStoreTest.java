package org.apache.datawise.backend.configstore.migration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.MigrationTableCheckpoint;
import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MigrationJobStoreTest {

    @TempDir
    Path tempDir;

    private MigrationJobStore store;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        store = new MigrationJobStore(configDirectory, new ObjectMapper().registerModule(new JavaTimeModule()));
    }

    @Test
    void saveAndFindOwnedJob() {
        MigrationJobEntity job = sampleJob("job-1", 7L);
        store.save(job);

        assertTrue(store.findOwned(7L, "job-1").isPresent());
        assertEquals("running", store.findOwned(7L, "job-1").orElseThrow().getStatus());
        assertTrue(store.findOwned(8L, "job-1").isEmpty());
        assertTrue(tempDir.resolve(ConfigPaths.MIGRATION_JOBS).toFile().isFile());
    }

    @Test
    void upsertUpdatesExistingJob() {
        MigrationJobEntity job = sampleJob("job-1", 1L);
        store.save(job);

        MigrationTableCheckpoint checkpoint = new MigrationTableCheckpoint();
        checkpoint.setTableName("users");
        checkpoint.setStatus("running");
        checkpoint.setLastOffset(500);
        checkpoint.setRowsMigrated(500);
        checkpoint.setBatchesCompleted(1);
        checkpoint.setUpdatedAt(Instant.now());
        job.getTables().put("users", checkpoint);
        job.setStatus("partial");
        store.save(job);

        MigrationJobEntity loaded = store.findById("job-1").orElseThrow();
        assertEquals("partial", loaded.getStatus());
        assertEquals(500, loaded.tableCheckpoint("users").getLastOffset());
    }

    private static MigrationJobEntity sampleJob(String id, long userId) {
        MigrationJobEntity job = new MigrationJobEntity();
        job.setId(id);
        job.setUserId(userId);
        job.setStatus("running");
        job.setRequestFingerprint("fp");
        job.setRequest(new TableMigrationBatchRequest(
                "src",
                "shop",
                "tgt",
                "warehouse",
                List.of(new TableMigrationBatchTableRequest("users", false)),
                null,
                null,
                null,
                null,
                500,
                0,
                true,
                id,
                null,
                null,
                null));
        job.setTablesPlanned(List.of("users"));
        job.setTables(new LinkedHashMap<>());
        job.setCreatedAt(Instant.now());
        job.setUpdatedAt(Instant.now());
        return job;
    }
}
