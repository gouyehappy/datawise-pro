package org.apache.datawise.backend.kudu;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.kudu.client.KuduClient;

import java.util.concurrent.TimeUnit;

/** Creates {@link KuduClient} instances from {@link ConnectionEntity}. */
public final class KuduClientFactory {

    private static final int DEFAULT_PORT = 7051;
    private static final int TIMEOUT_MS = (int) TimeUnit.SECONDS.toMillis(30);

    private KuduClientFactory() {
    }

    public static KuduClient open(ConnectionEntity entity) {
        return new KuduClient.KuduClientBuilder(resolveMasters(entity))
                .defaultAdminOperationTimeoutMs(TIMEOUT_MS)
                .defaultOperationTimeoutMs(TIMEOUT_MS)
                .defaultSocketReadTimeoutMs(TIMEOUT_MS)
                .build();
    }

    public static String resolveMasters(ConnectionEntity entity) {
        String override = trimToNull(entity.getJdbcUrl());
        if (override != null && !override.startsWith("jdbc:")) {
            return normalizeMasters(override);
        }
        String host = firstNonBlank(entity.getHost(), "localhost");
        if (host.contains(",")) {
            return normalizeMasters(host);
        }
        return host + ":" + parsePort(entity.getPort(), DEFAULT_PORT);
    }

    static String normalizeMasters(String value) {
        String trimmed = value.trim();
        if (trimmed.startsWith("kudu://")) {
            return trimmed.substring("kudu://".length());
        }
        return trimmed;
    }

    static int parsePort(String port, int defaultPort) {
        if (port == null || port.isBlank()) {
            return defaultPort;
        }
        try {
            return Integer.parseInt(port.trim());
        } catch (NumberFormatException ex) {
            return defaultPort;
        }
    }

    private static String firstNonBlank(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim();
    }

    private static String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
