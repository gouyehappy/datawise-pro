package org.apache.datawise.desktop.updater;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Resolved update plan: incremental component packs (skip JCEF runtime) or a full installer.
 */
public final class DesktopUpdatePlan {
    public enum Channel {
        NONE,
        INCREMENTAL,
        FULL
    }

    public enum InstallAction {
        NONE,
        /** Frontend-only: apply + CEF reload, no process exit. */
        RELOAD,
        /** Server jar (or FE+server): apply then relaunch. */
        RESTART,
        /** Native installer / portable zip. */
        INSTALLER
    }

    private final Channel channel;
    private final List<Item> items;
    private final long downloadBytes;
    private final long fullPackageBytes;
    private final String summary;

    public DesktopUpdatePlan(
            Channel channel,
            List<Item> items,
            long downloadBytes,
            long fullPackageBytes,
            String summary
    ) {
        this.channel = channel == null ? Channel.NONE : channel;
        this.items = List.copyOf(items == null ? List.of() : items);
        this.downloadBytes = Math.max(0L, downloadBytes);
        this.fullPackageBytes = Math.max(0L, fullPackageBytes);
        this.summary = summary == null ? "" : summary;
    }

    public static DesktopUpdatePlan none() {
        return new DesktopUpdatePlan(Channel.NONE, List.of(), 0L, 0L, "");
    }

    public Channel channel() {
        return channel;
    }

    public List<Item> items() {
        return items;
    }

    public long downloadBytes() {
        return downloadBytes;
    }

    public long fullPackageBytes() {
        return fullPackageBytes;
    }

    public long savedBytes() {
        if (fullPackageBytes <= 0L || downloadBytes <= 0L) {
            return Math.max(0L, fullPackageBytes - downloadBytes);
        }
        return Math.max(0L, fullPackageBytes - downloadBytes);
    }

    public String summary() {
        return summary;
    }

    public boolean isEmpty() {
        return channel == Channel.NONE || items.isEmpty();
    }

    public InstallAction installAction() {
        if (isEmpty()) {
            return InstallAction.NONE;
        }
        if (channel == Channel.FULL) {
            return InstallAction.INSTALLER;
        }
        boolean hasServer = false;
        boolean hasFrontend = false;
        for (Item item : items) {
            if ("server-jar".equals(item.kind())) {
                hasServer = true;
            } else if ("frontend-dist".equals(item.kind())) {
                hasFrontend = true;
            }
        }
        if (hasServer) {
            return InstallAction.RESTART;
        }
        if (hasFrontend) {
            return InstallAction.RELOAD;
        }
        return InstallAction.INSTALLER;
    }

    public List<String> kinds() {
        List<String> kinds = new ArrayList<>(items.size());
        for (Item item : items) {
            kinds.add(item.kind());
        }
        return kinds;
    }

    public String channelKey() {
        return channel.name().toLowerCase(Locale.ROOT);
    }

    public String installActionKey() {
        return installAction().name().toLowerCase(Locale.ROOT);
    }

    /**
     * One downloadable unit in the plan.
     *
     * @param kind    {@code frontend-dist}, {@code server-jar}, {@code installer}, or {@code portable-zip}
     * @param name    release asset file name
     * @param url     browser download URL
     * @param sha256  optional lowercase hex digest
     * @param bytes   GitHub asset size (0 when unknown)
     */
    public record Item(String kind, String name, String url, String sha256, long bytes) {
    }
}
