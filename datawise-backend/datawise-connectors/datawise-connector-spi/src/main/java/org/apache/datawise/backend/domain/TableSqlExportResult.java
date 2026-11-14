package org.apache.datawise.backend.domain;

/**
 * SQL export payload. {@code objectStorageKey}/{@code objectStorageUri} are set when
 * {@code datawise.object-storage.publish-exports=true}.
 */
public record TableSqlExportResult(
        String sql,
        String fileName,
        String objectStorageKey,
        String objectStorageUri) {

    public TableSqlExportResult(String sql, String fileName) {
        this(sql, fileName, null, null);
    }
}
