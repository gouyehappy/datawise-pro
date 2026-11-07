package org.apache.datawise.backend.database.federated;

import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinPlan;
import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinStep;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FederatedJoinPredicatePushdownTest {

    @Test
    void pushesSingleAliasPredicatesAndKeepsCrossAliasResidual() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, status FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name, region FROM users", "o.user_id = u.id")
                ),
                "o.status = 'active' AND u.region = 'CN' AND o.user_id = u.id"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        assertNull(result.plan().outerWhere());
        assertTrue(result.plan().steps().get(0).subQuery().toUpperCase().contains("STATUS"));
        assertTrue(result.plan().steps().get(1).subQuery().toUpperCase().contains("REGION"));
        assertFalse(result.plan().steps().get(0).subQuery().contains("o."));
        assertEquals("o.user_id = u.id", result.residualWhere());
        assertTrue(result.pushedByTableAlias().containsKey("o"));
        assertTrue(result.pushedByTableAlias().containsKey("u"));
    }

    @Test
    void residualFilterAppliesCrossAliasEquality() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.user_id", 9, "u.id", 9, "u.name", "A"),
                Map.of("o.id", 2, "o.user_id", 8, "u.id", 9, "u.name", "B")
        );
        List<Map<String, Object>> filtered = FederatedJoinResidualFilter.apply(rows, "o.user_id = u.id");
        assertEquals(1, filtered.size());
        assertEquals(1, filtered.get(0).get("o.id"));
    }

    @Test
    void residualFilterSupportsTopLevelOrAcrossAliases() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.status", "active", "u.region", "US"),
                Map.of("o.id", 2, "o.status", "closed", "u.region", "CN"),
                Map.of("o.id", 3, "o.status", "closed", "u.region", "US")
        );
        List<Map<String, Object>> filtered = FederatedJoinResidualFilter.apply(
                rows,
                "o.status = 'active' OR u.region = 'CN'"
        );
        assertEquals(2, filtered.size());
        assertEquals(1, filtered.get(0).get("o.id"));
        assertEquals(2, filtered.get(1).get("o.id"));
    }

    @Test
    void residualFilterSupportsParenthesizedOrAndedWithComparison() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.status", "active", "u.region", "US", "o.user_id", 9, "u.id", 9),
                Map.of("o.id", 2, "o.status", "closed", "u.region", "CN", "o.user_id", 8, "u.id", 9),
                Map.of("o.id", 3, "o.status", "active", "u.region", "CN", "o.user_id", 7, "u.id", 7)
        );
        List<Map<String, Object>> filtered = FederatedJoinResidualFilter.apply(
                rows,
                "(o.status = 'active' OR u.region = 'CN') AND o.user_id = u.id"
        );
        assertEquals(2, filtered.size());
        assertEquals(1, filtered.get(0).get("o.id"));
        assertEquals(3, filtered.get(1).get("o.id"));
    }

    @Test
    void crossAliasOrRemainsResidualAfterPushdown() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, status FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name, region FROM users", "o.user_id = u.id")
                ),
                "o.amount > 0 AND (o.status = 'active' OR u.region = 'CN')"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        assertTrue(result.plan().steps().get(0).subQuery().toUpperCase().contains("AMOUNT"));
        assertEquals("(o.status = 'active' OR u.region = 'CN')", result.residualWhere());
    }

    @Test
    void splitOrIsParenAware() {
        assertEquals(
                List.of("o.status = 'active'", "u.region = 'CN'"),
                FederatedJoinPredicatePushdown.splitOr("o.status = 'active' OR u.region = 'CN'")
        );
        assertEquals(
                List.of("(o.status = 'active' OR u.region = 'CN')"),
                FederatedJoinPredicatePushdown.splitOr("(o.status = 'active' OR u.region = 'CN')")
        );
    }

    @Test
    void residualFilterSupportsInAndNotIn() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.status", "active", "u.region", "US"),
                Map.of("o.id", 2, "o.status", "pending", "u.region", "CN"),
                Map.of("o.id", 3, "o.status", "closed", "u.region", "US")
        );
        List<Map<String, Object>> inFiltered = FederatedJoinResidualFilter.apply(
                rows,
                "o.status IN ('active', 'pending')"
        );
        assertEquals(2, inFiltered.size());
        assertEquals(1, inFiltered.get(0).get("o.id"));
        assertEquals(2, inFiltered.get(1).get("o.id"));

        List<Map<String, Object>> notInFiltered = FederatedJoinResidualFilter.apply(
                rows,
                "o.status NOT IN ('closed')"
        );
        assertEquals(2, notInFiltered.size());
    }

    @Test
    void residualFilterSupportsInCombinedWithOr() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.status", "closed", "u.region", "US"),
                Map.of("o.id", 2, "o.status", "closed", "u.region", "CN"),
                Map.of("o.id", 3, "o.status", "active", "u.region", "US")
        );
        List<Map<String, Object>> filtered = FederatedJoinResidualFilter.apply(
                rows,
                "o.status IN ('active') OR u.region = 'CN'"
        );
        assertEquals(2, filtered.size());
        assertEquals(2, filtered.get(0).get("o.id"));
        assertEquals(3, filtered.get(1).get("o.id"));
    }

    @Test
    void residualFilterSupportsBareNot() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.status", "active", "u.region", "US"),
                Map.of("o.id", 2, "o.status", "closed", "u.region", "CN"),
                Map.of("o.id", 3, "o.status", "closed", "u.region", "US")
        );
        List<Map<String, Object>> filtered = FederatedJoinResidualFilter.apply(
                rows,
                "NOT o.status = 'closed'"
        );
        assertEquals(1, filtered.size());
        assertEquals(1, filtered.get(0).get("o.id"));
    }

    @Test
    void residualFilterSupportsBareNotOverOrGroup() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.status", "active", "u.region", "US"),
                Map.of("o.id", 2, "o.status", "closed", "u.region", "CN"),
                Map.of("o.id", 3, "o.status", "closed", "u.region", "US")
        );
        // Negate (active OR CN) → keep only closed+US
        List<Map<String, Object>> filtered = FederatedJoinResidualFilter.apply(
                rows,
                "NOT (o.status = 'active' OR u.region = 'CN')"
        );
        assertEquals(1, filtered.size());
        assertEquals(3, filtered.get(0).get("o.id"));
    }

    @Test
    void singleAliasOrIsPushedIntoSourceSubquery() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, status FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name, region FROM users", "o.user_id = u.id")
                ),
                "o.status = 'active' OR o.status = 'pending'"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        String ordersSql = result.plan().steps().get(0).subQuery().toUpperCase();
        assertTrue(ordersSql.contains("STATUS"));
        assertTrue(ordersSql.contains(" OR "));
        assertTrue(ordersSql.contains("ACTIVE"));
        assertTrue(ordersSql.contains("PENDING"));
        assertFalse(result.plan().steps().get(0).subQuery().contains("o."));
        assertNull(result.residualWhere());
    }

    @Test
    void singleAliasIsNullIsPushedIntoSourceSubquery() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, deleted_at FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name FROM users", "o.user_id = u.id")
                ),
                "o.deleted_at IS NULL AND u.name IS NOT NULL"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        assertTrue(result.plan().steps().get(0).subQuery().toUpperCase().contains("IS NULL"));
        assertTrue(result.plan().steps().get(1).subQuery().toUpperCase().contains("IS NOT NULL"));
        assertNull(result.residualWhere());
    }

    @Test
    void residualFilterSupportsIsNullAcrossAliases() {
        Map<String, Object> withNull = new java.util.HashMap<>();
        withNull.put("o.id", 1);
        withNull.put("o.deleted_at", null);
        withNull.put("u.region", "CN");
        Map<String, Object> withValue = Map.of("o.id", 2, "o.deleted_at", "2026-01-01", "u.region", "US");
        List<Map<String, Object>> filtered = FederatedJoinResidualFilter.apply(
                List.of(withNull, withValue),
                "o.deleted_at IS NULL OR u.region = 'US'"
        );
        assertEquals(2, filtered.size());

        List<Map<String, Object>> onlyNull = FederatedJoinResidualFilter.apply(
                List.of(withNull, withValue),
                "o.deleted_at IS NULL"
        );
        assertEquals(1, onlyNull.size());
        assertEquals(1, onlyNull.get(0).get("o.id"));

        List<Map<String, Object>> notNull = FederatedJoinResidualFilter.apply(
                List.of(withNull, withValue),
                "o.deleted_at IS NOT NULL"
        );
        assertEquals(1, notNull.size());
        assertEquals(2, notNull.get(0).get("o.id"));
    }

    @Test
    void residualFilterSupportsLikeAndNotLike() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.name", "alpha", "u.region", "CN"),
                Map.of("o.id", 2, "o.name", "beta", "u.region", "US"),
                Map.of("o.id", 3, "o.name", "alpine", "u.region", "CN")
        );
        List<Map<String, Object>> like = FederatedJoinResidualFilter.apply(rows, "o.name LIKE 'al%'");
        assertEquals(2, like.size());
        assertEquals(1, like.get(0).get("o.id"));
        assertEquals(3, like.get(1).get("o.id"));

        List<Map<String, Object>> notLike = FederatedJoinResidualFilter.apply(rows, "o.name NOT LIKE 'al%'");
        assertEquals(1, notLike.size());
        assertEquals(2, notLike.get(0).get("o.id"));

        List<Map<String, Object>> mixed = FederatedJoinResidualFilter.apply(
                rows,
                "o.name LIKE 'a_p%' OR u.region = 'US'"
        );
        assertEquals(3, mixed.size());
    }

    @Test
    void singleAliasLikeIsPushedIntoSourceSubquery() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, name FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name, region FROM users", "o.user_id = u.id")
                ),
                "o.name LIKE 'acme%' AND u.region = 'CN'"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        String ordersSql = result.plan().steps().get(0).subQuery().toUpperCase();
        assertTrue(ordersSql.contains("LIKE"));
        assertTrue(ordersSql.contains("ACME%"));
        assertTrue(result.plan().steps().get(1).subQuery().toUpperCase().contains("REGION"));
        assertNull(result.residualWhere());
    }

    @Test
    void residualFilterSupportsUpperLowerFunctions() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.status", "Active", "u.region", "cn"),
                Map.of("o.id", 2, "o.status", "closed", "u.region", "US"),
                Map.of("o.id", 3, "o.status", "ACTIVE", "u.region", "jp")
        );
        List<Map<String, Object>> upperEq = FederatedJoinResidualFilter.apply(
                rows,
                "UPPER(o.status) = 'ACTIVE'"
        );
        assertEquals(2, upperEq.size());
        assertEquals(1, upperEq.get(0).get("o.id"));
        assertEquals(3, upperEq.get(1).get("o.id"));

        List<Map<String, Object>> lowerLike = FederatedJoinResidualFilter.apply(
                rows,
                "LOWER(u.region) LIKE 'c%'"
        );
        assertEquals(1, lowerLike.size());
        assertEquals(1, lowerLike.get(0).get("o.id"));

        List<Map<String, Object>> mixed = FederatedJoinResidualFilter.apply(
                rows,
                "UPPER(o.status) = UPPER('active') OR LOWER(u.region) = 'us'"
        );
        assertEquals(3, mixed.size());
    }

    @Test
    void singleAliasUpperIsPushedIntoSourceSubquery() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, status FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name, region FROM users", "o.user_id = u.id")
                ),
                "UPPER(o.status) = 'ACTIVE' AND LOWER(u.region) = 'cn'"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        assertTrue(result.plan().steps().get(0).subQuery().toUpperCase().contains("UPPER"));
        assertTrue(result.plan().steps().get(1).subQuery().toUpperCase().contains("LOWER"));
        assertNull(result.residualWhere());
    }

    @Test
    void residualFilterSupportsTrimFunctions() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.name", "  alice  ", "u.code", " cn"),
                Map.of("o.id", 2, "o.name", "bob", "u.code", "us "),
                Map.of("o.id", 3, "o.name", "  carol", "u.code", " jp ")
        );
        List<Map<String, Object>> trimEq = FederatedJoinResidualFilter.apply(
                rows,
                "TRIM(o.name) = 'alice'"
        );
        assertEquals(1, trimEq.size());
        assertEquals(1, trimEq.get(0).get("o.id"));

        List<Map<String, Object>> ltrim = FederatedJoinResidualFilter.apply(
                rows,
                "LTRIM(u.code) = 'cn'"
        );
        assertEquals(1, ltrim.size());
        assertEquals(1, ltrim.get(0).get("o.id"));

        List<Map<String, Object>> rtrim = FederatedJoinResidualFilter.apply(
                rows,
                "RTRIM(u.code) = 'us'"
        );
        assertEquals(1, rtrim.size());
        assertEquals(2, rtrim.get(0).get("o.id"));

        List<Map<String, Object>> mixed = FederatedJoinResidualFilter.apply(
                rows,
                "TRIM(o.name) = 'bob' OR TRIM(u.code) = 'jp'"
        );
        assertEquals(2, mixed.size());
    }

    @Test
    void singleAliasTrimIsPushedIntoSourceSubquery() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, name FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name, code FROM users", "o.user_id = u.id")
                ),
                "TRIM(o.name) = 'alice' AND LTRIM(u.code) = 'cn'"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        assertTrue(result.plan().steps().get(0).subQuery().toUpperCase().contains("TRIM"));
        assertTrue(result.plan().steps().get(1).subQuery().toUpperCase().contains("LTRIM"));
        assertNull(result.residualWhere());
    }

    @Test
    void residualFilterSupportsBetweenAndNotBetween() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.amount", 5, "u.score", 10),
                Map.of("o.id", 2, "o.amount", 15, "u.score", 20),
                Map.of("o.id", 3, "o.amount", 25, "u.score", 5)
        );
        List<Map<String, Object>> between = FederatedJoinResidualFilter.apply(
                rows,
                "o.amount BETWEEN 10 AND 20"
        );
        assertEquals(1, between.size());
        assertEquals(2, between.get(0).get("o.id"));

        List<Map<String, Object>> notBetween = FederatedJoinResidualFilter.apply(
                rows,
                "o.amount NOT BETWEEN 10 AND 20"
        );
        assertEquals(2, notBetween.size());

        List<Map<String, Object>> mixed = FederatedJoinResidualFilter.apply(
                rows,
                "o.amount BETWEEN 1 AND 10 OR u.score BETWEEN 15 AND 25"
        );
        assertEquals(2, mixed.size());
    }

    @Test
    void singleAliasBetweenIsPushedIntoSourceSubquery() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, amount FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name, score FROM users", "o.user_id = u.id")
                ),
                "o.amount BETWEEN 10 AND 20 AND u.score BETWEEN 1 AND 100"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        String ordersSql = result.plan().steps().get(0).subQuery().toUpperCase();
        assertTrue(ordersSql.contains("BETWEEN"));
        assertTrue(ordersSql.contains("AND"));
        assertTrue(result.plan().steps().get(1).subQuery().toUpperCase().contains("BETWEEN"));
        assertNull(result.residualWhere());
    }

    @Test
    void splitAndKeepsBetweenBoundsTogether() {
        List<String> parts = FederatedJoinPredicatePushdown.splitAnd(
                "o.amount BETWEEN 10 AND 20 AND u.region = 'cn'"
        );
        assertEquals(2, parts.size());
        assertEquals("o.amount BETWEEN 10 AND 20", parts.get(0));
        assertEquals("u.region = 'cn'", parts.get(1));
    }

    @Test
    void residualFilterSupportsLengthAbsCoalesceConcatSubstr() {
        Map<String, Object> row1 = new java.util.HashMap<>();
        row1.put("o.id", 1);
        row1.put("o.name", "  ab  ");
        row1.put("o.amount", -5);
        row1.put("o.nick", null);
        row1.put("u.code", "xy");
        Map<String, Object> row2 = new java.util.HashMap<>();
        row2.put("o.id", 2);
        row2.put("o.name", "hello");
        row2.put("o.amount", 12);
        row2.put("o.nick", "n2");
        row2.put("u.code", "zz");
        List<Map<String, Object>> rows = List.of(row1, row2);

        List<Map<String, Object>> byLen = FederatedJoinResidualFilter.apply(
                rows,
                "LENGTH(TRIM(o.name)) = 2"
        );
        assertEquals(1, byLen.size());
        assertEquals(1, byLen.get(0).get("o.id"));

        List<Map<String, Object>> byAbs = FederatedJoinResidualFilter.apply(
                rows,
                "ABS(o.amount) = 5"
        );
        assertEquals(1, byAbs.size());

        List<Map<String, Object>> byCoalesce = FederatedJoinResidualFilter.apply(
                rows,
                "COALESCE(o.nick, u.code) = 'xy'"
        );
        assertEquals(1, byCoalesce.size());
        assertEquals(1, byCoalesce.get(0).get("o.id"));

        List<Map<String, Object>> byNullif = FederatedJoinResidualFilter.apply(
                rows,
                "NULLIF(u.code, 'zz') IS NULL"
        );
        assertEquals(1, byNullif.size());
        assertEquals(2, byNullif.get(0).get("o.id"));

        List<Map<String, Object>> byConcat = FederatedJoinResidualFilter.apply(
                rows,
                "CONCAT(u.code, '-', 'x') = 'xy-x' OR u.code || '1' = 'zz1'"
        );
        assertEquals(2, byConcat.size());

        List<Map<String, Object>> bySubstr = FederatedJoinResidualFilter.apply(
                rows,
                "SUBSTR(o.name, 1, 2) = 'he'"
        );
        assertEquals(1, bySubstr.size());
        assertEquals(2, bySubstr.get(0).get("o.id"));
    }

    @Test
    void residualFilterSupportsCast() {
        Map<String, Object> row1 = new java.util.HashMap<>();
        row1.put("o.id", 1);
        row1.put("o.code", "42");
        row1.put("o.flag", "true");
        Map<String, Object> row2 = new java.util.HashMap<>();
        row2.put("o.id", 2);
        row2.put("o.code", "7");
        row2.put("o.flag", "0");
        List<Map<String, Object>> rows = List.of(row1, row2);

        List<Map<String, Object>> byInt = FederatedJoinResidualFilter.apply(
                rows,
                "CAST(o.code AS INTEGER) = 42"
        );
        assertEquals(1, byInt.size());
        assertEquals(1, byInt.get(0).get("o.id"));

        List<Map<String, Object>> byVarchar = FederatedJoinResidualFilter.apply(
                rows,
                "CAST(o.id AS VARCHAR) = '2'"
        );
        assertEquals(1, byVarchar.size());
        assertEquals(2, byVarchar.get(0).get("o.id"));

        List<Map<String, Object>> byBool = FederatedJoinResidualFilter.apply(
                rows,
                "CAST(o.flag AS BOOLEAN) = true"
        );
        assertEquals(1, byBool.size());
        assertEquals(1, byBool.get(0).get("o.id"));

        assertEquals("hello", FederatedJoinResidualFilter.applyCast("hello", "varchar"));
        assertEquals(42L, FederatedJoinResidualFilter.applyCast("42", "int"));
        assertThrows(IllegalArgumentException.class, () ->
                FederatedJoinResidualFilter.applyCast("x", "uuid"));
    }

    @Test
    void residualFilterSupportsCaseWhen() {
        Map<String, Object> row1 = new java.util.HashMap<>();
        row1.put("o.id", 1);
        row1.put("o.status", 1);
        Map<String, Object> row2 = new java.util.HashMap<>();
        row2.put("o.id", 2);
        row2.put("o.status", 0);
        List<Map<String, Object>> rows = List.of(row1, row2);

        // Parenthesize CASE so the outer '=' is not confused with WHEN predicates.
        List<Map<String, Object>> paid = FederatedJoinResidualFilter.apply(
                rows,
                "(CASE WHEN o.status = 1 THEN 'paid' ELSE 'pending' END) = 'paid'"
        );
        assertEquals(1, paid.size());
        assertEquals(1, paid.get(0).get("o.id"));

        List<Map<String, Object>> pending = FederatedJoinResidualFilter.apply(
                rows,
                "(CASE WHEN o.status = 1 THEN 'paid' ELSE 'pending' END) = 'pending'"
        );
        assertEquals(1, pending.size());
        assertEquals(2, pending.get(0).get("o.id"));

        FederatedJoinCaseSupport.CaseExpr parsed = FederatedJoinResidualFilter.parseCase(
                "CASE WHEN o.status = 1 THEN 'paid' ELSE 'pending' END"
        );
        assertNotNull(parsed);
        assertEquals("o.status = 1", parsed.predicate());
        assertEquals("'paid'", parsed.thenExpr());
        assertEquals("'pending'", parsed.elseExpr());
    }

    @Test
    void residualFilterSupportsRound() {
        Map<String, Object> row1 = new java.util.HashMap<>();
        row1.put("o.id", 1);
        row1.put("o.amount", 1.44);
        Map<String, Object> row2 = new java.util.HashMap<>();
        row2.put("o.id", 2);
        row2.put("o.amount", 1.46);
        List<Map<String, Object>> rows = List.of(row1, row2);

        List<Map<String, Object>> byZero = FederatedJoinResidualFilter.apply(
                rows,
                "ROUND(o.amount) = 1"
        );
        assertEquals(2, byZero.size());

        List<Map<String, Object>> byScale = FederatedJoinResidualFilter.apply(
                rows,
                "ROUND(o.amount, 1) = 1.5"
        );
        assertEquals(1, byScale.size());
        assertEquals(2, byScale.get(0).get("o.id"));

        assertEquals(2L, FederatedJoinResidualFilter.roundValue(1.5, null));
        assertEquals(1.5, FederatedJoinResidualFilter.roundValue(1.46, 1));
        assertEquals(1.4, FederatedJoinResidualFilter.roundValue(1.44, 1));
    }

    @Test
    void residualFilterSupportsCeilAndFloor() {
        Map<String, Object> row1 = new java.util.HashMap<>();
        row1.put("o.id", 1);
        row1.put("o.amount", 1.2);
        Map<String, Object> row2 = new java.util.HashMap<>();
        row2.put("o.id", 2);
        row2.put("o.amount", 1.8);
        List<Map<String, Object>> rows = List.of(row1, row2);

        List<Map<String, Object>> byCeil = FederatedJoinResidualFilter.apply(rows, "CEIL(o.amount) = 2");
        assertEquals(2, byCeil.size());

        List<Map<String, Object>> byFloor = FederatedJoinResidualFilter.apply(rows, "FLOOR(o.amount) = 1");
        assertEquals(2, byFloor.size());

        assertEquals(2L, FederatedJoinResidualFilter.ceilValue(1.1));
        assertEquals(1L, FederatedJoinResidualFilter.floorValue(1.9));
        assertEquals(2L, FederatedJoinResidualFilter.ceilValue("1.01"));
    }

    @Test
    void residualFilterSupportsGreatestAndLeast() {
        Map<String, Object> row1 = new java.util.HashMap<>();
        row1.put("o.id", 1);
        row1.put("o.a", 3);
        row1.put("o.b", 9);
        Map<String, Object> row2 = new java.util.HashMap<>();
        row2.put("o.id", 2);
        row2.put("o.a", 5);
        row2.put("o.b", 1);
        List<Map<String, Object>> rows = List.of(row1, row2);

        List<Map<String, Object>> byGreatest = FederatedJoinResidualFilter.apply(
                rows,
                "GREATEST(o.a, o.b) = 9"
        );
        assertEquals(1, byGreatest.size());
        assertEquals(1, byGreatest.get(0).get("o.id"));

        List<Map<String, Object>> byLeast = FederatedJoinResidualFilter.apply(
                rows,
                "LEAST(o.a, o.b) = 1"
        );
        assertEquals(1, byLeast.size());
        assertEquals(2, byLeast.get(0).get("o.id"));

        assertEquals(9, FederatedJoinResidualFilter.extremumValue(java.util.Arrays.asList(3, null, 9), true));
        assertEquals(1, FederatedJoinResidualFilter.extremumValue(java.util.Arrays.asList(5, 1, null), false));
        assertNull(FederatedJoinResidualFilter.extremumValue(java.util.Arrays.asList(null, null), true));
    }

    @Test
    void singleAliasLengthIsPushedIntoSourceSubquery() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, name FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name FROM users", "o.user_id = u.id")
                ),
                "LENGTH(o.name) > 3 AND ABS(o.id) >= 1"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        String ordersSql = result.plan().steps().get(0).subQuery().toUpperCase();
        assertTrue(ordersSql.contains("LENGTH"));
        assertTrue(ordersSql.contains("ABS"));
        assertNull(result.residualWhere());
    }

    @Test
    void toIntRejectsOutOfRangeAndAcceptsNumericStrings() {
        assertEquals("ab", FederatedJoinResidualFilter.substringValue("abcdef", 1L, 2L));
        assertEquals("cd", FederatedJoinResidualFilter.substringValue("abcdef", "3", "2"));
        // floating start truncates toward zero → start 1
        assertEquals("a", FederatedJoinResidualFilter.substringValue("ab", 1.9, 1));

        assertThrows(IllegalArgumentException.class, () ->
                FederatedJoinResidualFilter.substringValue("x", Long.MAX_VALUE, 1)
        );
        assertThrows(IllegalArgumentException.class, () ->
                FederatedJoinResidualFilter.substringValue("x", "nope", 1)
        );
    }

    @Test
    void residualFilterSupportsLikeEscape() {
        List<Map<String, Object>> rows = List.of(
                Map.of("o.id", 1, "o.name", "a%b"),
                Map.of("o.id", 2, "o.name", "axb"),
                Map.of("o.id", 3, "o.name", "a_b")
        );
        List<Map<String, Object>> escapedPercent = FederatedJoinResidualFilter.apply(
                rows,
                "o.name LIKE 'a\\%b' ESCAPE '\\'"
        );
        assertEquals(1, escapedPercent.size());
        assertEquals(1, escapedPercent.get(0).get("o.id"));

        List<Map<String, Object>> escapedUnderscore = FederatedJoinResidualFilter.apply(
                rows,
                "o.name LIKE 'a\\_b' ESCAPE '\\'"
        );
        assertEquals(1, escapedUnderscore.size());
        assertEquals(3, escapedUnderscore.get(0).get("o.id"));

        assertTrue(FederatedJoinResidualFilter.likeMatches("100%", "100\\%", '\\'));
        assertFalse(FederatedJoinResidualFilter.likeMatches("1000", "100\\%", '\\'));
    }

    @Test
    void singleAliasLikeEscapeIsPushedIntoSourceSubquery() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, name FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name FROM users", "o.user_id = u.id")
                ),
                "o.name LIKE 'acme\\_%' ESCAPE '\\'"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        String ordersSql = result.plan().steps().get(0).subQuery().toUpperCase();
        assertTrue(ordersSql.contains("LIKE"));
        assertTrue(ordersSql.contains("ESCAPE"));
        assertNull(result.residualWhere());
    }

    @Test
    void likePatternToRegexEscapesRegexMetacharacters() {
        assertTrue(FederatedJoinResidualFilter.likeMatches("a.b", "a.b"));
        assertFalse(FederatedJoinResidualFilter.likeMatches("axb", "a.b"));
        assertTrue(FederatedJoinResidualFilter.likeMatches("axb", "a_b"));
        assertTrue(FederatedJoinResidualFilter.likeMatches("hello", "%ell%"));
    }

    @Test
    void singleAliasNotIsPushedIntoSourceSubquery() {
        FederatedJoinPlan plan = new FederatedJoinPlan(
                List.of("o.id", "u.name"),
                List.of(
                        new FederatedJoinStep("orders", "o", "SELECT id, user_id, status FROM orders", null),
                        new FederatedJoinStep("users", "u", "SELECT id, name, region FROM users", "o.user_id = u.id")
                ),
                "NOT o.status = 'closed' AND u.region = 'CN'"
        );

        FederatedJoinPredicatePushdown.PushdownResult result = FederatedJoinPredicatePushdown.apply(plan);

        String ordersSql = result.plan().steps().get(0).subQuery().toUpperCase();
        assertTrue(ordersSql.contains("NOT"));
        assertTrue(ordersSql.contains("STATUS"));
        assertTrue(result.plan().steps().get(1).subQuery().toUpperCase().contains("REGION"));
        assertNull(result.residualWhere());
    }
}
