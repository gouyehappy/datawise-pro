package org.apache.datawise.backend.security;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.domain.TenantIds;

import java.util.Set;

import java.util.function.Supplier;

public final class UserContext {

    private static final String API_TOKEN_SESSION_PREFIX = "api-token:";

    private static final ThreadLocal<Long> USER_ID = new ThreadLocal<>();

    private static final ThreadLocal<Boolean> GUEST = new ThreadLocal<>();

    private static final ThreadLocal<String> SESSION_ID = new ThreadLocal<>();

    private static final ThreadLocal<Set<String>> API_TOKEN_SCOPES = new ThreadLocal<>();

    private static final ThreadLocal<String> TENANT_ID = new ThreadLocal<>();

    public record Snapshot(Long userId, boolean guest, String sessionId, Set<String> apiTokenScopes, String tenantId) {

        public Snapshot(Long userId, boolean guest, String sessionId) {

            this(userId, guest, sessionId, null, TenantIds.DEFAULT);

        }

        public Snapshot(Long userId, boolean guest, String sessionId, Set<String> apiTokenScopes) {

            this(userId, guest, sessionId, apiTokenScopes, TenantIds.DEFAULT);

        }

    }

    private UserContext() {

    }

    public static void set(Long userId, boolean guest, String sessionId) {

        set(userId, guest, sessionId, TenantIds.DEFAULT);

    }

    public static void set(Long userId, boolean guest, String sessionId, String tenantId) {

        USER_ID.set(userId);

        GUEST.set(guest);

        SESSION_ID.set(sessionId);

        API_TOKEN_SCOPES.remove();

        TENANT_ID.set(TenantIds.normalizeOrDefault(tenantId));

    }

    public static void setApiToken(Long userId, String tokenId, Set<String> scopes) {

        setApiToken(userId, tokenId, scopes, TenantIds.DEFAULT);

    }

    public static void setApiToken(Long userId, String tokenId, Set<String> scopes, String tenantId) {

        USER_ID.set(userId);

        GUEST.set(false);

        SESSION_ID.set(API_TOKEN_SESSION_PREFIX + tokenId);

        API_TOKEN_SCOPES.set(scopes == null ? Set.of() : Set.copyOf(scopes));

        TENANT_ID.set(TenantIds.normalizeOrDefault(tenantId));

    }

    public static boolean isApiTokenAuth() {

        String sessionId = getSessionId();

        return sessionId != null && sessionId.startsWith(API_TOKEN_SESSION_PREFIX);

    }

    public static boolean hasApiTokenScope(String scope) {

        Set<String> scopes = API_TOKEN_SCOPES.get();

        return scopes != null && scopes.contains(scope);

    }

    public static Snapshot snapshotOrNull() {

        Long userId = getUserId();

        if (userId == null) {

            return null;

        }

        Set<String> scopes = API_TOKEN_SCOPES.get();

        return new Snapshot(

                userId,

                isGuest(),

                getSessionId(),

                scopes == null ? null : Set.copyOf(scopes),

                getTenantId()

        );

    }

    public static <T> T runAs(Snapshot snapshot, Supplier<T> task) {
        if (snapshot == null) {
            return task.get();
        }
        Snapshot previous = snapshotOrNull();
        applySnapshot(snapshot);
        try {
            return task.get();
        } finally {
            applySnapshot(previous);
        }
    }

    public static void runAs(Snapshot snapshot, Runnable task) {

        runAs(snapshot, () -> {

            task.run();

            return null;

        });

    }

    public static Long getUserId() {

        return USER_ID.get();

    }

    public static Long requireUserId() {

        Long userId = USER_ID.get();

        if (userId == null) {

            throw new UnauthorizedException();

        }

        return userId;

    }

    public static boolean isGuest() {

        return Boolean.TRUE.equals(GUEST.get());

    }

    public static String getSessionId() {

        return SESSION_ID.get();

    }

    public static String getTenantId() {

        return TenantIds.normalizeOrDefault(TENANT_ID.get());

    }

    public static String requireTenantId() {

        requireUserId();

        return getTenantId();

    }

    public static void clear() {

        USER_ID.remove();

        GUEST.remove();

        SESSION_ID.remove();

        API_TOKEN_SCOPES.remove();

        TENANT_ID.remove();

    }

    private static void applySnapshot(Snapshot snapshot) {

        if (snapshot == null || snapshot.userId() == null) {

            clear();

            return;

        }

        if (snapshot.apiTokenScopes() != null || isApiTokenSessionId(snapshot.sessionId())) {

            setApiToken(

                    snapshot.userId(),

                    extractApiTokenId(snapshot.sessionId()),

                    snapshot.apiTokenScopes() != null ? snapshot.apiTokenScopes() : Set.of(),

                    snapshot.tenantId()

            );

            return;

        }

        set(snapshot.userId(), snapshot.guest(), snapshot.sessionId(), snapshot.tenantId());

    }

    private static boolean isApiTokenSessionId(String sessionId) {

        return sessionId != null && sessionId.startsWith(API_TOKEN_SESSION_PREFIX);

    }

    private static String extractApiTokenId(String sessionId) {

        if (sessionId == null || !sessionId.startsWith(API_TOKEN_SESSION_PREFIX)) {

            return "";

        }

        return sessionId.substring(API_TOKEN_SESSION_PREFIX.length());

    }

}
