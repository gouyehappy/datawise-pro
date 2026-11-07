package org.apache.datawise.backend.sync.support;

import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;

/** 迁移请求指纹：续传前校验参数未变更。 */
public final class MigrationRequestFingerprint {

    private MigrationRequestFingerprint() {
    }

    public static String compute(TableMigrationBatchRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Request is required");
        }
        String tables = request.tables() == null
                ? ""
                : request.tables().stream()
                        .map(TableMigrationBatchTableRequest::tableName)
                        .map(name -> name != null ? name.trim() : "")
                        .sorted()
                        .collect(Collectors.joining("|"));
        String payload = String.join(
                "\u0000",
                normalize(request.sourceConnectionId()),
                normalize(request.sourceDatabase()),
                normalize(request.targetConnectionId()),
                normalize(request.targetDatabase()),
                normalize(request.mode()),
                normalize(request.watermarkColumn()),
                normalizeOrderByColumns(request.orderByColumns()),
                normalize(request.whereClause()),
                String.valueOf(request.batchSize()),
                String.valueOf(request.throttleMs()),
                String.valueOf(request.truncateTarget()),
                normalize(request.conflictStrategy()),
                tables
        );
        return sha256Hex(payload);
    }

    public static String computeTable(String tableName, String selectSql, int batchSize) {
        String payload = String.join(
                "\u0000",
                normalize(tableName),
                normalize(selectSql),
                String.valueOf(batchSize)
        );
        return sha256Hex(payload);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private static String normalizeOrderByColumns(List<String> orderByColumns) {
        if (orderByColumns == null || orderByColumns.isEmpty()) {
            return "";
        }
        return orderByColumns.stream()
                .map(column -> column != null ? column.trim() : "")
                .filter(column -> !column.isEmpty())
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .collect(Collectors.joining(","));
    }

    private static String sha256Hex(String payload) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available", ex);
        }
    }
}
