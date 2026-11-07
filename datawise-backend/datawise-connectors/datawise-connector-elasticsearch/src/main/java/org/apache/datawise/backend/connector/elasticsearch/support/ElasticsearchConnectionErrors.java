package org.apache.datawise.backend.connector.elasticsearch.support;

import org.apache.datawise.backend.model.ConnectionEntity;

/** User-facing Elasticsearch REST connection errors. */
public final class ElasticsearchConnectionErrors {

    private ElasticsearchConnectionErrors() {
    }

    public static String toUserMessage(ConnectionEntity entity, Throwable error) {
        String target = entity != null && entity.getHost() != null ? entity.getHost() : "elasticsearch";
        String detail = error != null && error.getMessage() != null && !error.getMessage().isBlank()
                ? error.getMessage()
                : (error != null ? error.getClass().getSimpleName() : "unknown error");
        return "Failed to reach Elasticsearch at " + target + ": " + detail;
    }
}
