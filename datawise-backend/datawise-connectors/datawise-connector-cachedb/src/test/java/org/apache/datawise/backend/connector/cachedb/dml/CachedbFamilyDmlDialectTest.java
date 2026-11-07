package org.apache.datawise.backend.connector.cachedb.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class CachedbFamilyDmlDialectTest {

    private final CachedbFamilyDmlDialect dialect = new CachedbFamilyDmlDialect();

    @Test
    void supportsCachedb() {
        assertTrue(dialect.supports("cachedb"));
    }
}
