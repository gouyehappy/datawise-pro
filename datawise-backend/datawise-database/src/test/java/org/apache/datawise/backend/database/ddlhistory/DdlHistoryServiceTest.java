package org.apache.datawise.backend.database.ddlhistory;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.DdlHistoryEntry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DdlHistoryServiceTest {

    @TempDir
    Path tempDir;

    private DdlHistoryService service;

    @BeforeEach
    void setUp() {
        ObjectMapper mapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        service = new DdlHistoryService(new ConfigDirectoryService(tempDir), mapper);
    }

    @Test
    void recordAndListNewestFirst() {
        service.record("conn-1", "shop", "orders", "CREATE", "CREATE TABLE orders (id INT)", 1L);
        service.record("conn-1", "shop", "orders", "ALTER", "ALTER TABLE orders ADD COLUMN n INT", 1L);

        List<DdlHistoryEntry> entries = service.list("conn-1", "shop", 10);
        assertEquals(2, entries.size());
        assertEquals("ALTER", entries.get(0).action());
        assertEquals("CREATE", entries.get(1).action());
        assertTrue(entries.get(0).sql().contains("ALTER TABLE"));
    }

    @Test
    void filtersByDatabaseWhenProvided() {
        service.record("conn-1", "shop", "a", "CREATE", "CREATE TABLE a (id INT)", 1L);
        service.record("conn-1", "other", "b", "CREATE", "CREATE TABLE b (id INT)", 1L);

        List<DdlHistoryEntry> shopOnly = service.list("conn-1", "shop", 10);
        assertEquals(1, shopOnly.size());
        assertEquals("a", shopOnly.get(0).objectName());
    }
}
