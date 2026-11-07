package org.apache.datawise.backend.database.drift;

import org.junit.jupiter.api.Test;

import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SchemaDriftServiceTest {

    @Test
    void compilePatternTreatsPercentAsAllTables() {
        assertNull(SchemaDriftService.compilePattern("%"));
    }

    @Test
    void compilePatternConvertsSqlLikePercentWildcard() {
        Pattern pattern = SchemaDriftService.compilePattern("ods_%");

        assertTrue(pattern.matcher("ods_order").matches());
        assertTrue(pattern.matcher("ODS_order_detail").matches());
        assertFalse(pattern.matcher("dwd_order").matches());
    }

    @Test
    void compilePatternKeepsRegexWhenPercentWildcardIsAbsent() {
        Pattern pattern = SchemaDriftService.compilePattern("^dim_.*");

        assertTrue(pattern.matcher("dim_user").matches());
        assertFalse(pattern.matcher("ods_dim_user").matches());
    }
}