package org.apache.datawise.backend.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TableMigrationPropertiesTest {

    @Test
    void checkpointPersistEveryBatches_clampsToMinimumOne() {
        TableMigrationProperties properties = new TableMigrationProperties();
        properties.setCheckpointPersistEveryBatches(0);
        assertEquals(1, properties.getCheckpointPersistEveryBatches());
    }

    @Test
    void migrationJobThreads_clampsToMinimumOne() {
        TableMigrationProperties properties = new TableMigrationProperties();
        properties.setMigrationJobThreads(0);
        assertEquals(1, properties.getMigrationJobThreads());
    }

    @Test
    void defaults_matchMigrationRuntimeExpectations() {
        TableMigrationProperties properties = new TableMigrationProperties();
        assertEquals(1, properties.getCheckpointPersistEveryBatches());
        assertEquals(4, properties.getMigrationJobThreads());
    }
}
