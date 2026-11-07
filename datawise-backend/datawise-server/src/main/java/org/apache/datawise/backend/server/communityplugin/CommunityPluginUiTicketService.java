package org.apache.datawise.backend.server.communityplugin;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Iterator;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Short-lived tickets for community-plugin UI iframe GETs.
 * Avoids putting the long-lived session id in {@code ?dwSession=} (logs / Referer / history).
 * A successful ticket redeem also mints a path-scoped cookie grant for relative UI assets.
 */
@Service
public class CommunityPluginUiTicketService {

    public static final String QUERY_TICKET = "dwUiTicket";
    public static final String COOKIE_NAME = "DW-Plugin-Ui";

    /** Bootstrap ticket lifetime (HTML + first-wave assets). */
    public static final long TICKET_TTL_MS = 120_000L;
    /** Cookie grant lifetime for subsequent UI asset GETs. */
    public static final long GRANT_TTL_MS = 30 * 60_000L;

    private static final int MAX_ENTRIES = 10_000;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ConcurrentHashMap<String, Entry> tickets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Entry> grants = new ConcurrentHashMap<>();

    public IssuedTicket issue(String sessionId, String pluginId) {
        String sid = requireNonBlank(sessionId, "sessionId");
        String pid = requireNonBlank(pluginId, "pluginId");
        pruneIfNeeded();
        String ticket = newToken();
        long expiresAt = System.currentTimeMillis() + TICKET_TTL_MS;
        tickets.put(ticket, new Entry(sid, pid, expiresAt));
        return new IssuedTicket(ticket, TICKET_TTL_MS / 1000L);
    }

    /**
     * Resolve a one-shot bootstrap ticket for {@code pluginId}. Does not remove the ticket
     * (parallel asset requests may share it within TTL); returns empty when expired/mismatched.
     */
    public Optional<String> resolveTicket(String ticket, String pluginId) {
        return resolve(tickets, ticket, pluginId);
    }

    public Optional<String> resolveGrant(String grantToken, String pluginId) {
        return resolve(grants, grantToken, pluginId);
    }

    /** Mint a path-scoped cookie grant after a successful ticket redeem. */
    public String mintGrant(String sessionId, String pluginId) {
        String sid = requireNonBlank(sessionId, "sessionId");
        String pid = requireNonBlank(pluginId, "pluginId");
        pruneIfNeeded();
        String grant = newToken();
        grants.put(grant, new Entry(sid, pid, System.currentTimeMillis() + GRANT_TTL_MS));
        return grant;
    }

    public static String cookiePathForPlugin(String pluginId) {
        return "/api/community-plugins/" + pluginId + "/ui";
    }

    public static String extractPluginIdFromUiPath(String path) {
        if (path == null) {
            return null;
        }
        String prefix = "/api/community-plugins/";
        int start = path.indexOf(prefix);
        if (start < 0) {
            return null;
        }
        int idStart = start + prefix.length();
        int uiIdx = path.indexOf("/ui/", idStart);
        if (uiIdx <= idStart) {
            return null;
        }
        String id = path.substring(idStart, uiIdx);
        return id.isBlank() ? null : id;
    }

    private Optional<String> resolve(ConcurrentHashMap<String, Entry> map, String token, String pluginId) {
        if (token == null || token.isBlank() || pluginId == null || pluginId.isBlank()) {
            return Optional.empty();
        }
        Entry entry = map.get(token.trim());
        if (entry == null) {
            return Optional.empty();
        }
        long now = System.currentTimeMillis();
        if (now > entry.expiresAt()) {
            map.remove(token.trim(), entry);
            return Optional.empty();
        }
        if (!pluginId.equals(entry.pluginId())) {
            return Optional.empty();
        }
        return Optional.of(entry.sessionId());
    }

    private void pruneIfNeeded() {
        if (tickets.size() + grants.size() < MAX_ENTRIES) {
            return;
        }
        long now = System.currentTimeMillis();
        pruneExpired(tickets, now);
        pruneExpired(grants, now);
    }

    private static void pruneExpired(ConcurrentHashMap<String, Entry> map, long now) {
        Iterator<Map.Entry<String, Entry>> it = map.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, Entry> e = it.next();
            if (now > e.getValue().expiresAt()) {
                it.remove();
            }
        }
    }

    private static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required");
        }
        return value.trim();
    }

    public record IssuedTicket(String ticket, long expiresInSec) {
    }

    private record Entry(String sessionId, String pluginId, long expiresAt) {
    }
}
