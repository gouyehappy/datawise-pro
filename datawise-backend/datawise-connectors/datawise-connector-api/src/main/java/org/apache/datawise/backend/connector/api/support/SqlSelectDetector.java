package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.sqlparser.support.SqlTextSupport;

import java.util.regex.Pattern;

public final class SqlSelectDetector {

    private static final Pattern PAGED_SELECT_PREFIX = Pattern.compile("^(WITH\\b|SELECT\\b)");

    private SqlSelectDetector() {
    }

    /** 是否可按 LIMIT/OFFSET 分页的只读查询（SELECT / WITH，不含 EXPLAIN） */
    public static boolean isPagedSelect(String sql) {
        String normalized = normalize(sql);
        if (normalized.isEmpty()) {
            return false;
        }
        if (normalized.startsWith("EXPLAIN ")) {
            return false;
        }
        return PAGED_SELECT_PREFIX.matcher(normalized).lookingAt();
    }

    static String normalize(String sql) {
        return SqlTextSupport.normalizeForClassification(sql);
    }
}
