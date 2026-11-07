package org.apache.datawise.backend.datagen;

public record DatagenPreviewRequest(
        String connectionId,
        String database,
        String tableName,
        Integer rowCount,
        Long seed,
        Integer rowOffset
) {
    public DatagenPreviewRequest(
            String connectionId,
            String database,
            String tableName,
            Integer rowCount,
            Long seed
    ) {
        this(connectionId, database, tableName, rowCount, seed, null);
    }
}

