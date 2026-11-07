package org.apache.datawise.backend.elasticsearch;

import org.apache.datawise.backend.model.ConnectionEntity;

/** Thin helpers around {@link ElasticsearchRestClient}. */
public final class ElasticsearchConnectionSupport {

    private ElasticsearchConnectionSupport() {
    }

    public static ElasticsearchRestClient client(ConnectionEntity entity) {
        return new ElasticsearchRestClient(ElasticsearchConnectionConfig.from(entity));
    }

    public static ElasticsearchRestClient.RestResponse probe(ConnectionEntity entity)
            throws Exception {
        ElasticsearchConnectionConfig config = ElasticsearchConnectionConfig.from(entity);
        if (config.connectivityCheckDisabled()) {
            return new ElasticsearchRestClient.RestResponse(200, "{\"skipped\":true}", "GET", "/");
        }
        return new ElasticsearchRestClient(config).probeConnectivity();
    }

    public static String describeTarget(ConnectionEntity entity) {
        return ElasticsearchConnectionConfig.from(entity).describeTarget();
    }
}
