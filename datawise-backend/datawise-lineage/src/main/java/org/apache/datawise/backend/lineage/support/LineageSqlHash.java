package org.apache.datawise.backend.lineage.support;

import org.apache.datawise.backend.common.support.SqlContentHash;

/** @deprecated Prefer {@link SqlContentHash}; kept for lineage-module call sites. */
@Deprecated
public final class LineageSqlHash {

    private LineageSqlHash() {
    }

    public static String normalize(String sql) {
        return SqlContentHash.normalize(sql);
    }

    public static String sha256(String sql) {
        return SqlContentHash.sha256(sql);
    }
}
