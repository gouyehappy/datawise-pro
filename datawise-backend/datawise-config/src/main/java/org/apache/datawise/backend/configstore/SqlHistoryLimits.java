package org.apache.datawise.backend.configstore;

/**
 * §2.1 — Standard edition keeps the most recent 200 SQL history rows per user (Wave 38).
 */
public final class SqlHistoryLimits {

    public static final int FREE_MAX_ENTRIES = 200;

    private SqlHistoryLimits() {
    }
}
