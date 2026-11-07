package org.apache.datawise.backend.common.support;

import org.apache.datawise.backend.model.ConnectionEntity;

/** Formats connection endpoints for error messages. */
public final class ConnectionTargetSupport {

    private ConnectionTargetSupport() {
    }

    public static String describeHostPort(ConnectionEntity entity) {
        return describeHostPort(entity, false);
    }

    /**
     * @param preserveHostWhenMultiBootstrap when true, returns bootstrap string as-is if it contains commas
     */
    public static String describeHostPort(ConnectionEntity entity, boolean preserveHostWhenMultiBootstrap) {
        if (entity == null) {
            return "";
        }
        String host = entity.getHost();
        String port = entity.getPort();
        if (host == null || host.isBlank()) {
            return "";
        }
        if (preserveHostWhenMultiBootstrap && host.contains(",")) {
            return host;
        }
        if (port == null || port.isBlank()) {
            return host;
        }
        return host + ":" + port;
    }
}
