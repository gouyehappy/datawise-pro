package org.apache.datawise.backend.service;

import org.apache.datawise.backend.configstore.SchemaCacheStore;
import org.apache.datawise.backend.configstore.SessionEphemeralCatalogStore;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 访客退出或切换会话时清理临时 catalog 与 schema 缓存。
 */
@Service
public class GuestSessionCleanupService {

    private final SessionEphemeralCatalogStore ephemeralCatalogStore;
    private final SchemaCacheStore schemaCacheStore;
    private final ConnectionRuntimeCleanup connectionRuntimeCleanup;

    public GuestSessionCleanupService(
                                      SessionEphemeralCatalogStore ephemeralCatalogStore,
                                      SchemaCacheStore schemaCacheStore,
                                      @Autowired(required = false) ConnectionRuntimeCleanup connectionRuntimeCleanup) {
        this.ephemeralCatalogStore = ephemeralCatalogStore;
        this.schemaCacheStore = schemaCacheStore;
        this.connectionRuntimeCleanup = connectionRuntimeCleanup;
    }

    public void cleanupCurrentSession() {
        String sessionId = UserContext.getSessionId();
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        cleanupSession(sessionId, UserContext.isGuest());
    }

    public void cleanupSession(String sessionId, boolean guest) {
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        List<String> connectionIds = new ArrayList<>();
        if (guest) {
            connectionIds.addAll(ephemeralCatalogStore.listConnectionIds(sessionId));
            ephemeralCatalogStore.removeSession(sessionId);
        }
        schemaCacheStore.clearSession(sessionId);
        if (connectionRuntimeCleanup != null) {
            connectionRuntimeCleanup.onSessionCleanup(sessionId, guest, connectionIds);
        }
    }
}
