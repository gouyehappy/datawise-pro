package org.apache.datawise.backend.common.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PathSegmentSanitizerTest {

    @Test
    void sanitizeRemovesPathSeparators() {
        assertEquals("a-b", PathSegmentSanitizer.sanitize("a/b", "x"));
    }

    @Test
    void sanitizeFileNameEnsuresSqlExtension() {
        assertEquals("console.sql", PathSegmentSanitizer.sanitizeFileName("console", "fallback.sql"));
    }

    @Test
    void sanitizeUsesFallbackWhenBlank() {
        assertEquals("inst", PathSegmentSanitizer.sanitize("   ", "inst"));
    }

    @Test
    void requireSqlFileNameRejectsDashOnly() {
        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class,
                () -> PathSegmentSanitizer.requireSqlFileName("-"));
    }

    @Test
    void requireSqlFileNameAcceptsScriptName() {
        assertEquals("Script-2.sql", PathSegmentSanitizer.requireSqlFileName("Script-2"));
    }

    @Test
    void requireSqlFileNameAcceptsCjkName() {
        assertEquals("业务查询.sql", PathSegmentSanitizer.requireSqlFileName("业务查询"));
    }
}
