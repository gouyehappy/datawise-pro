package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.config.ObjectStorageProperties;
import org.apache.datawise.backend.storage.LocalObjectStorageProvider;
import org.apache.datawise.backend.storage.ObjectStorageKey;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TableSqlExportObjectStoragePublisherTest {

    @TempDir
    Path tempDir;

    @Test
    void skipsWhenDisabled() throws Exception {
        ObjectStorageProperties props = new ObjectStorageProperties();
        props.setPublishExports(false);
        LocalObjectStorageProvider storage = new LocalObjectStorageProvider(tempDir);
        TableSqlExportObjectStoragePublisher publisher =
                new TableSqlExportObjectStoragePublisher(storage, props);

        var result = publisher.publishIfEnabled("select 1", "t.sql", "conn", "shop");
        assertNull(result.objectStorageKey());
        assertNull(result.objectStorageUri());
    }

    @Test
    void publishesWhenEnabled() throws Exception {
        ObjectStorageProperties props = new ObjectStorageProperties();
        props.setPublishExports(true);
        props.setExportKeyPrefix("exports");
        LocalObjectStorageProvider storage = new LocalObjectStorageProvider(tempDir);
        TableSqlExportObjectStoragePublisher publisher =
                new TableSqlExportObjectStoragePublisher(storage, props);

        var result = publisher.publishIfEnabled("select 1;\n", "users.sql", "conn-1", "shop");
        assertNotNull(result.objectStorageKey());
        assertTrue(result.objectStorageKey().startsWith("exports/conn-1/shop/"));
        assertTrue(result.objectStorageKey().endsWith("-users.sql"));
        assertNotNull(result.objectStorageUri());
        assertTrue(storage.exists(ObjectStorageKey.of(result.objectStorageKey())));
        assertEquals(
                "select 1;\n",
                new String(storage.get(ObjectStorageKey.of(result.objectStorageKey())).readAllBytes(), StandardCharsets.UTF_8)
        );
    }

    @Test
    void joinSkipsBlankSegments() {
        assertEquals("exports/a/b.sql", TableSqlExportObjectStoragePublisher.join("exports", "a", "", "b.sql"));
    }
}
