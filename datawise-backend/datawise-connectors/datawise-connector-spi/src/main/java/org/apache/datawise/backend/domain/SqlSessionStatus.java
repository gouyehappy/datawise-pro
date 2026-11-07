package org.apache.datawise.backend.domain;

public record SqlSessionStatus(
        boolean autocommit,
        boolean pending,
        String connectionId,
        String database) {

    public static SqlSessionStatus idle(String connectionId, String database) {
        return new SqlSessionStatus(true, false, connectionId, database);
    }
}
