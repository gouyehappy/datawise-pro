package org.apache.datawise.backend.domain;

import java.util.Map;

/** Local audit snapshot for table row DML (time-travel restore). */
public record TableDataChangeAuditEntry(
        String id,
        long createdAtMs,
        String operation,
        Map<String, Object> beforeRow,
        Map<String, Object> afterRow,
        Map<String, Object> primaryKey,
        boolean reverted,
        String restoredFromId) {

    public static final String OP_INSERT = "INSERT";
    public static final String OP_UPDATE = "UPDATE";
    public static final String OP_DELETE = "DELETE";
    public static final String OP_RESTORE = "RESTORE";
}
