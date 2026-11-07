package org.apache.datawise.backend.lineage.parser.lakehouse;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LakehouseSqlSupportTest {

    @Test
    void stripsHiveDistributeBy() {
        LakehouseSqlSupport.NormalizationResult result = LakehouseSqlSupport.normalizeForLineage(
                "SELECT a FROM t DISTRIBUTE BY a"
        );
        assertTrue(result.changed());
        assertTrue(result.strippedClauses().contains("DISTRIBUTE_BY"));
        assertEquals("SELECT a FROM t", result.sql());
    }

    @Test
    void rewritesInsertOverwrite() {
        LakehouseSqlSupport.NormalizationResult result = LakehouseSqlSupport.normalizeForLineage(
                "INSERT OVERWRITE TABLE t SELECT 1"
        );
        assertTrue(result.strippedClauses().contains("INSERT_OVERWRITE"));
        assertTrue(result.sql().toUpperCase().startsWith("INSERT INTO"));
    }

    @Test
    void detectsFlinkWindowTvf() {
        var features = LakehouseSqlSupport.detectHardFeatures(
                "SELECT * FROM TABLE(TUMBLE(TABLE orders, DESCRIPTOR(ts), INTERVAL '1' HOUR))"
        );
        assertEquals(1, features.size());
        assertEquals(LakehouseSqlSupport.LakehouseFeature.WINDOW_TVF, features.get(0));
    }

    @Test
    void detectsAndSoftensUnnestWithOrdinality() {
        String sql = "SELECT * FROM t CROSS JOIN UNNEST(t.arr) WITH ORDINALITY AS u(x, ord)";
        var features = LakehouseSqlSupport.detectHardFeatures(sql);
        assertEquals(1, features.size());
        assertEquals(LakehouseSqlSupport.LakehouseFeature.UNNEST_ORDINALITY, features.get(0));

        LakehouseSqlSupport.SoftenResult softened = LakehouseSqlSupport.softenHardFeatures(sql);
        assertTrue(softened.changed());
        assertTrue(softened.softenedFeatures().contains("UNNEST_ORDINALITY"));
        assertFalse(softened.sql().toUpperCase().contains("ORDINALITY"));
    }

    @Test
    void softensTryCastToCast() {
        String sql = "SELECT TRY_CAST(a AS VARCHAR) AS v FROM t";
        var features = LakehouseSqlSupport.detectHardFeatures(sql);
        assertTrue(features.contains(LakehouseSqlSupport.LakehouseFeature.TRY_CAST));

        LakehouseSqlSupport.SoftenResult softened = LakehouseSqlSupport.softenHardFeatures(sql);
        assertTrue(softened.softenedFeatures().contains("TRY_CAST"));
        assertTrue(softened.sql().toUpperCase().contains("CAST("));
        assertFalse(softened.sql().toUpperCase().contains("TRY_CAST"));
    }

    @Test
    void softensCubeAndGroupingSets() {
        LakehouseSqlSupport.SoftenResult cube = LakehouseSqlSupport.softenHardFeatures(
                "SELECT a, b, COUNT(*) FROM t GROUP BY CUBE(a, b)"
        );
        assertTrue(cube.softenedFeatures().contains("ADVANCED_GROUPING"));
        assertFalse(cube.sql().toUpperCase().contains("CUBE"));
        assertTrue(cube.sql().toUpperCase().contains("GROUP BY"));
        assertTrue(cube.sql().contains("a, b") || cube.sql().contains("a,b"));

        LakehouseSqlSupport.SoftenResult sets = LakehouseSqlSupport.softenHardFeatures(
                "SELECT a, b, COUNT(*) FROM t GROUP BY GROUPING SETS ((a, b), (a))"
        );
        assertTrue(sets.softenedFeatures().contains("ADVANCED_GROUPING"));
        assertFalse(sets.sql().toUpperCase().contains("GROUPING SETS"));
        assertTrue(sets.sql().toUpperCase().contains("A") && sets.sql().toUpperCase().contains("B"));
    }

    @Test
    void softensQualifyClause() {
        String sql = "SELECT a, ROW_NUMBER() OVER (ORDER BY a) AS rn FROM t QUALIFY rn = 1 ORDER BY a";
        var features = LakehouseSqlSupport.detectHardFeatures(sql);
        assertTrue(features.contains(LakehouseSqlSupport.LakehouseFeature.QUALIFY));

        LakehouseSqlSupport.SoftenResult softened = LakehouseSqlSupport.softenHardFeatures(sql);
        assertTrue(softened.softenedFeatures().contains("QUALIFY"));
        assertFalse(softened.sql().toUpperCase().contains("QUALIFY"));
        assertTrue(softened.sql().toUpperCase().contains("ORDER BY"));
    }

    @Test
    void softensPivotAndUnpivot() {
        String pivotSql = "SELECT * FROM sales PIVOT (SUM(amount) FOR region IN ('E', 'W')) AS p";
        assertTrue(LakehouseSqlSupport.detectHardFeatures(pivotSql)
                .contains(LakehouseSqlSupport.LakehouseFeature.PIVOT));
        LakehouseSqlSupport.SoftenResult pivot = LakehouseSqlSupport.softenHardFeatures(pivotSql);
        assertTrue(pivot.softenedFeatures().contains("PIVOT"));
        assertFalse(pivot.sql().toUpperCase().contains("PIVOT"));
        assertTrue(pivot.sql().toUpperCase().contains("FROM SALES"));

        String unpivotSql = "SELECT * FROM wide UNPIVOT (v FOR c IN (a, b)) u";
        LakehouseSqlSupport.SoftenResult unpivot = LakehouseSqlSupport.softenHardFeatures(unpivotSql);
        assertTrue(unpivot.softenedFeatures().contains("UNPIVOT"));
        assertFalse(unpivot.sql().toUpperCase().contains("UNPIVOT"));
    }

    @Test
    void ignoresLakehouseKeywordsInsideStringLiterals() {
        String sql = "SELECT 'QUALIFY rn = 1' AS note, a FROM t WHERE b = 'LATERAL VIEW explode'";
        assertTrue(LakehouseSqlSupport.detectHardFeatures(sql).isEmpty());

        LakehouseSqlSupport.SoftenResult softened = LakehouseSqlSupport.softenHardFeatures(sql);
        assertFalse(softened.changed());
        assertEquals(sql, softened.sql());

        LakehouseSqlSupport.NormalizationResult normalized = LakehouseSqlSupport.normalizeForLineage(
                "SELECT 'DISTRIBUTE BY x' AS c FROM t"
        );
        assertFalse(normalized.changed());
        assertTrue(normalized.sql().contains("DISTRIBUTE BY"));
    }

    @Test
    void stillSoftensQualifyOutsideQuotes() {
        String sql = "SELECT a, 'QUALIFY decoy' AS decoy, ROW_NUMBER() OVER (ORDER BY a) AS rn FROM t QUALIFY rn = 1";
        assertTrue(LakehouseSqlSupport.detectHardFeatures(sql)
                .contains(LakehouseSqlSupport.LakehouseFeature.QUALIFY));
        LakehouseSqlSupport.SoftenResult softened = LakehouseSqlSupport.softenHardFeatures(sql);
        assertTrue(softened.softenedFeatures().contains("QUALIFY"));
        assertTrue(softened.sql().contains("QUALIFY decoy"));
        assertFalse(softened.sql().toUpperCase().matches("(?s).*\\bQUALIFY\\s+RN\\b.*"));
    }
}
