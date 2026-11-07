package org.apache.datawise.backend.lineage.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.LineageDialectCompatibility;
import org.apache.datawise.backend.domain.LineageGraphDto;
import org.apache.datawise.backend.domain.LineageMetaDto;
import org.apache.datawise.backend.domain.LineageNodeRefDto;
import org.apache.datawise.backend.lineage.support.LineageSqlHash;
import org.apache.datawise.backend.service.ViewModelAssembly;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ViewModelLineageStoreTest {

    @TempDir
    Path tempDir;

    private ViewModelLineageStore store;

    @BeforeEach
    void setUp() {
        store = new ViewModelLineageStore(ViewModelAssembly.workspaceSupportForTest(tempDir), new ObjectMapper());
    }

    @Test
    void writeAndReadSidecar() throws Exception {
        LineageGraphDto graph = sampleGraph("abc123");
        store.write("conn-1", "shop", "orders.view.sql", graph);

        LineageGraphDto loaded = store.read("conn-1", "shop", "orders.view.sql");
        assertNotNull(loaded);
        assertEqualsHash("abc123", loaded.meta().sqlHash());
        assertTrue(Files.isRegularFile(store.sidecarPath("conn-1", "shop", "orders.view.sql")));
    }

    @Test
    void deleteSidecar() throws Exception {
        store.write("conn-1", "shop", "orders.view.sql", sampleGraph("abc123"));
        store.delete("conn-1", "shop", "orders.view.sql");
        assertNull(store.read("conn-1", "shop", "orders.view.sql"));
    }

    @Test
    void isStaleWhenSqlHashDiffers() {
        LineageGraphDto cached = sampleGraph("old-hash");
        assertTrue(store.isStale(cached, "SELECT id FROM orders"));
        assertTrue(store.isStale(cached, null));
    }

    @Test
    void isFreshWhenSqlHashMatches() {
        String sql = "SELECT id FROM orders";
        LineageGraphDto cached = sampleGraph(LineageSqlHash.sha256(sql));
        assertFalse(store.isStale(cached, sql));
    }

    private static LineageGraphDto sampleGraph(String sqlHash) {
        return new LineageGraphDto(
                new LineageNodeRefDto("model:orders", "orders", "model"),
                List.of(),
                List.of(),
                new LineageMetaDto(
                        sqlHash,
                        Instant.now().toString(),
                        "mysql",
                        LineageDialectCompatibility.UNKNOWN,
                        "jsqlparser",
                        "5.3",
                        3,
                        "complete",
                        List.of()
                )
        );
    }

    private static void assertEqualsHash(String expected, String actual) {
        assertTrue(expected.equals(actual));
    }
}
