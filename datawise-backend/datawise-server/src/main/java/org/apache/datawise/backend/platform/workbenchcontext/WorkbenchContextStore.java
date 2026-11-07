package org.apache.datawise.backend.platform.workbenchcontext;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-user live workbench focus. Entries expire after {@link #TTL_MS} without heartbeat/PUT.
 */
@Component
public class WorkbenchContextStore {

    /** Design: 45s with no heartbeat → online=false / empty. */
    public static final long TTL_MS = 45_000L;

    private final ConcurrentHashMap<String, Entry> byKey = new ConcurrentHashMap<>();

    public void put(long userId, String tenantId, WorkbenchContextSnapshot snapshot) {
        String key = key(userId, tenantId);
        Instant now = Instant.now();
        WorkbenchContextSnapshot normalized = normalize(snapshot, now, true);
        byKey.put(key, new Entry(normalized, now.toEpochMilli()));
    }

    public void heartbeat(long userId, String tenantId) {
        String key = key(userId, tenantId);
        Instant now = Instant.now();
        byKey.compute(key, (k, existing) -> {
            if (existing == null || isExpired(existing, now.toEpochMilli())) {
                return new Entry(WorkbenchContextSnapshot.emptyOffline(now.toString()), now.toEpochMilli());
            }
            WorkbenchContextSnapshot snap = existing.snapshot();
            WorkbenchContextSnapshot online = new WorkbenchContextSnapshot(
                    snap.schemaVersion(),
                    now.toString(),
                    snap.publisher(),
                    true,
                    snap.focus(),
                    snap.activeTab(),
                    snap.openTabs(),
                    snap.selection(),
                    snap.pluginFocus(),
                    snap.privacy()
            );
            return new Entry(online, now.toEpochMilli());
        });
    }

    /**
     * Returns the latest snapshot for the user. Never null — offline empty when missing/expired.
     */
    public WorkbenchContextSnapshot get(long userId, String tenantId) {
        return get(userId, tenantId, true);
    }

    public WorkbenchContextSnapshot get(long userId, String tenantId, boolean includeBodyPreview) {
        Instant now = Instant.now();
        long nowMs = now.toEpochMilli();
        Entry entry = byKey.get(key(userId, tenantId));
        if (entry == null || isExpired(entry, nowMs)) {
            if (entry != null) {
                byKey.remove(key(userId, tenantId), entry);
            }
            return WorkbenchContextSnapshot.emptyOffline(now.toString());
        }
        WorkbenchContextSnapshot snap = entry.snapshot();
        if (!includeBodyPreview && snap.activeTab() != null) {
            WorkbenchContextSnapshot.ActiveTab tab = snap.activeTab();
            return new WorkbenchContextSnapshot(
                    snap.schemaVersion(),
                    snap.updatedAt(),
                    snap.publisher(),
                    true,
                    snap.focus(),
                    new WorkbenchContextSnapshot.ActiveTab(
                            tab.id(),
                            tab.type(),
                            tab.title(),
                            tab.connectionId(),
                            tab.database(),
                            null,
                            tab.bodyTruncated(),
                            tab.bodyLength()
                    ),
                    snap.openTabs(),
                    snap.selection(),
                    snap.pluginFocus(),
                    snap.privacy()
            );
        }
        return new WorkbenchContextSnapshot(
                snap.schemaVersion(),
                snap.updatedAt(),
                snap.publisher(),
                true,
                snap.focus(),
                snap.activeTab(),
                snap.openTabs(),
                snap.selection(),
                snap.pluginFocus(),
                snap.privacy()
        );
    }

    void clearForTests() {
        byKey.clear();
    }

    private static boolean isExpired(Entry entry, long nowMs) {
        return nowMs - entry.lastTouchMs() > TTL_MS;
    }

    private static String key(long userId, String tenantId) {
        return userId + ":" + Objects.requireNonNullElse(tenantId, "default");
    }

    private static WorkbenchContextSnapshot normalize(
            WorkbenchContextSnapshot incoming,
            Instant now,
            boolean online
    ) {
        if (incoming == null) {
            return WorkbenchContextSnapshot.emptyOffline(now.toString());
        }
        int resolvedBodyMax = WorkbenchContextSnapshot.DEFAULT_BODY_PREVIEW_MAX_CHARS;
        int resolvedPluginMax = WorkbenchContextSnapshot.DEFAULT_PLUGIN_TAIL_MAX_CHARS;
        WorkbenchContextSnapshot.Privacy privacy = incoming.privacy();
        if (privacy != null) {
            if (privacy.bodyPreviewMaxChars() > 0) {
                resolvedBodyMax = Math.min(privacy.bodyPreviewMaxChars(), WorkbenchContextSnapshot.DEFAULT_BODY_PREVIEW_MAX_CHARS);
            } else if (privacy.bodyPreviewMaxChars() == 0) {
                resolvedBodyMax = 0;
            }
            if (privacy.pluginTailMaxChars() > 0) {
                resolvedPluginMax = Math.min(privacy.pluginTailMaxChars(), WorkbenchContextSnapshot.DEFAULT_PLUGIN_TAIL_MAX_CHARS);
            } else if (privacy.pluginTailMaxChars() == 0) {
                resolvedPluginMax = 0;
            }
        }
        final int bodyMax = resolvedBodyMax;
        final int pluginMax = resolvedPluginMax;

        WorkbenchContextSnapshot.ActiveTab active = incoming.activeTab();
        if (active != null) {
            TruncatedBody body = truncate(active.bodyPreview(), bodyMax);
            active = new WorkbenchContextSnapshot.ActiveTab(
                    active.id(),
                    active.type(),
                    active.title(),
                    active.connectionId(),
                    active.database(),
                    body.text(),
                    body.truncated() || Boolean.TRUE.equals(active.bodyTruncated()),
                    active.bodyLength() != null ? active.bodyLength() : body.originalLength()
            );
        }

        var openTabs = incoming.openTabs() == null
                ? java.util.List.<WorkbenchContextSnapshot.OpenTab>of()
                : incoming.openTabs().stream().limit(WorkbenchContextSnapshot.MAX_OPEN_TABS).toList();

        var pluginFocus = incoming.pluginFocus() == null
                ? java.util.List.<WorkbenchContextSnapshot.PluginFocus>of()
                : incoming.pluginFocus().stream()
                .map(p -> {
                    TruncatedBody tail = truncate(p.tailPreview(), pluginMax);
                    String summary = p.summary();
                    if (summary != null && summary.length() > 200) {
                        summary = summary.substring(0, 200);
                    }
                    return new WorkbenchContextSnapshot.PluginFocus(
                            p.pluginId(),
                            p.kind(),
                            summary,
                            p.ref() == null ? Map.of() : Map.copyOf(p.ref()),
                            tail.text()
                    );
                })
                .toList();

        WorkbenchContextSnapshot.Focus focus = incoming.focus();
        if (focus == null) {
            focus = new WorkbenchContextSnapshot.Focus(
                    "other", null, null, null, null, null, null, null, null, null, null);
        }

        String publisher = incoming.publisher();
        if (publisher == null || publisher.isBlank()) {
            publisher = "unknown";
        }

        return new WorkbenchContextSnapshot(
                WorkbenchContextSnapshot.SCHEMA_VERSION,
                now.toString(),
                publisher,
                online,
                focus,
                active,
                openTabs,
                incoming.selection(),
                pluginFocus,
                new WorkbenchContextSnapshot.Privacy(true, bodyMax, pluginMax)
        );
    }

    private static TruncatedBody truncate(String text, int maxChars) {
        if (text == null) {
            return new TruncatedBody(null, false, 0);
        }
        int len = text.length();
        if (maxChars <= 0) {
            return new TruncatedBody(null, len > 0, len);
        }
        if (len <= maxChars) {
            return new TruncatedBody(text, false, len);
        }
        return new TruncatedBody(text.substring(0, maxChars), true, len);
    }

    private record Entry(WorkbenchContextSnapshot snapshot, long lastTouchMs) {
    }

    private record TruncatedBody(String text, boolean truncated, int originalLength) {
    }
}
