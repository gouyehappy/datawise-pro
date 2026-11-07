package org.apache.datawise.backend.jdbc.connection;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/** 记录各连接最近一次「真实使用」时间（不含健康探测 ping）。 */
@Component
public class ConnectionActivityRegistry {

    private final ConcurrentMap<String, Long> lastActivityMsByConnectionId = new ConcurrentHashMap<>();

    public void touch(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        lastActivityMsByConnectionId.put(connectionId, System.currentTimeMillis());
    }

    public void clear(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        lastActivityMsByConnectionId.remove(connectionId);
    }

    public Long getLastActivityMs(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return null;
        }
        return lastActivityMsByConnectionId.get(connectionId);
    }
}
