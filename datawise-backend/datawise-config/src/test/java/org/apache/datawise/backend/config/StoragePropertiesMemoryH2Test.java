package org.apache.datawise.backend.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StoragePropertiesMemoryH2Test {

    @Test
    void isMemoryH2Metadata_detectsMemUrls() {
        StorageProperties props = new StorageProperties();
        props.getDatasource().setJdbcUrl("jdbc:h2:mem:datawise_metadata;MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        assertTrue(props.isMemoryH2Metadata());

        props.getDatasource().setJdbcUrl("jdbc:h2:file:./data/metadata;MODE=PostgreSQL");
        assertFalse(props.isMemoryH2Metadata());

        props.getDatasource().setJdbcUrl("jdbc:postgresql://localhost:5432/datawise");
        assertFalse(props.isMemoryH2Metadata());

        props.getDatasource().setJdbcUrl("jdbc:h2:mem:other");
        assertTrue(props.isMemoryH2Metadata());
    }
}
