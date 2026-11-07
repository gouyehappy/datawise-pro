package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.api.support.RedisCommandPolicy;

/** Explorer-facing alias; enforcement lives in {@link RedisCommandPolicy}. */
final class RedisExplorerCommandPolicy {

    private RedisExplorerCommandPolicy() {
    }

    static void requireAllowed(String commandLine) {
        RedisCommandPolicy.requireAllowed(commandLine);
    }
}
