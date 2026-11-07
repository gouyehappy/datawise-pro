package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.config.DatawiseQueryProperties;
import org.springframework.stereotype.Component;

@Component
public class QueryLimitResolver {

    private final DatawiseQueryProperties properties;

    public QueryLimitResolver(DatawiseQueryProperties properties) {
        this.properties = properties;
    }

    /**
     * Merges client request with server default, then clamps to the absolute hard ceiling.
     * <p>
     * When both client and server are unlimited ({@code <= 0}) but
     * {@link DatawiseQueryProperties#getAbsoluteMaxResultRows()} {@code > 0}, returns the absolute
     * ceiling so interactive SELECT never materializes unbounded result sets into heap/JSON.
     */
    public int resolve(Integer clientMaxRows) {
        int serverDefault = properties.getMaxResultRows();
        int client = clientMaxRows != null ? Math.max(0, clientMaxRows) : 0;
        int hard = properties.getAbsoluteMaxResultRows();

        int resolved;
        if (serverDefault <= 0 && client <= 0) {
            resolved = 0;
        } else if (serverDefault <= 0) {
            resolved = client;
        } else if (client <= 0) {
            resolved = serverDefault;
        } else {
            resolved = Math.min(client, serverDefault);
        }

        if (hard <= 0) {
            return resolved;
        }
        if (resolved <= 0) {
            return hard;
        }
        return Math.min(resolved, hard);
    }
}
