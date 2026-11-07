package org.apache.datawise.backend.service;

import org.springframework.stereotype.Service;

/**
 * 连接写权限：由 {@link UserResourcePolicy} 裁决访客 catalog 写 + owner / 团队只读。
 */
@Service
public class ConnectionWritePolicy {

    private final UserResourcePolicy resourcePolicy;
    private final ConnectionVisibilityService visibilityService;
    private final ConnectionAccessService connectionAccessService;

    public ConnectionWritePolicy(
            UserResourcePolicy resourcePolicy,
            ConnectionVisibilityService visibilityService,
            ConnectionAccessService connectionAccessService
    ) {
        this.resourcePolicy = resourcePolicy;
        this.visibilityService = visibilityService;
        this.connectionAccessService = connectionAccessService;
    }

    public void requireConnectionWritable(String connectionId) {
        resourcePolicy.requireWrite(UserResource.CONNECTION_CATALOG);
        long userId = resourcePolicy.readUserIdFor(UserResource.CONNECTION_CATALOG);
        if (!visibilityService.canMutateConnection(userId, connectionId)) {
            throw new IllegalArgumentException("CONNECTION_ACCESS_DENIED");
        }
        if (!resourcePolicy.isGuestSession()) {
            connectionAccessService.requireWriteAccess(userId, connectionId);
        }
    }
}
