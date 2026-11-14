package org.apache.datawise.backend.ai.schema;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiSchemaDdlCompressorTest {

    @Test
    void compressDropsLowPriorityColumnsWithoutCuttingMidDefinition() {
        String ddl = """
                CREATE TABLE orders (
                  id BIGINT PRIMARY KEY,
                  obscure_payload VARCHAR(4000),
                  status VARCHAR(16) NOT NULL,
                  created_at TIMESTAMP
                )
                """;
        String compressed = AiSchemaDdlCompressor.compress(ddl, 120, Set.of("status"));
        assertTrue(compressed.contains("CREATE TABLE"), compressed);
        assertTrue(compressed.contains("status"), compressed);
        assertFalse(compressed.contains("obscure_payload"), compressed);
        assertTrue(compressed.length() < ddl.trim().length(), compressed);
    }
}
