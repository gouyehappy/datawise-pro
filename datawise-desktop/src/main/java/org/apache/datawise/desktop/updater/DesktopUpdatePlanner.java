package org.apache.datawise.desktop.updater;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * Builds an {@link DesktopUpdatePlan} from a GitHub release + optional {@code version.json} manifest.
 *
 * <p>Prefers component packs so clients skip the ~400&nbsp;MB JCEF runtime unless {@code runtime.id}
 * actually changed.
 */
public final class DesktopUpdatePlanner {
    private DesktopUpdatePlanner() {
    }

    public static DesktopUpdatePlan plan(
            JsonObject release,
            JsonObject versionManifest,
            DesktopLocalVersion local,
            String platformKey
    ) {
        Catalog catalog = Catalog.fromRelease(release, platformKey);
        DesktopLocalVersion remote = DesktopLocalVersion.fromReleaseManifest(versionManifest);
        long fullBytes = catalog.preferredFullBytes();

        if (runtimeChanged(local, remote)) {
            DesktopUpdatePlan.Item full = catalog.preferredFull();
            if (full == null) {
                return DesktopUpdatePlan.none();
            }
            return new DesktopUpdatePlan(
                    DesktopUpdatePlan.Channel.FULL,
                    List.of(full),
                    full.bytes() > 0 ? full.bytes() : fullBytes,
                    fullBytes,
                    "Runtime changed — full package required"
            );
        }

        boolean fingerprints = remote != null
                && (remote.hasFrontendFingerprint() || remote.hasServerJarFingerprint());

        boolean needFrontend;
        boolean needServer;
        if (fingerprints) {
            needFrontend = remote.hasFrontendFingerprint()
                    && !Objects.equals(remote.frontendSha256(), local.frontendSha256());
            needServer = remote.hasServerJarFingerprint()
                    && !Objects.equals(remote.serverJarSha256(), local.serverJarSha256());
            // Newer release without a component we know about → still take available packs.
            if (!needFrontend && !needServer) {
                // Version bump with identical fingerprints: nothing to download.
                return DesktopUpdatePlan.none();
            }
        } else {
            // Legacy releases: download every incremental asset present (never leave a layer stale).
            needFrontend = catalog.frontend != null;
            needServer = catalog.serverJar != null;
        }

        List<DesktopUpdatePlan.Item> items = new ArrayList<>(2);
        // Server first so a mixed apply ends with FE local_version (full stamp) + one relaunch.
        if (needServer && catalog.serverJar != null) {
            items.add(catalog.serverJar);
        }
        if (needFrontend && catalog.frontend != null) {
            items.add(catalog.frontend);
        }

        if (!items.isEmpty()) {
            long download = 0L;
            for (DesktopUpdatePlan.Item item : items) {
                download += Math.max(0L, item.bytes());
            }
            return new DesktopUpdatePlan(
                    DesktopUpdatePlan.Channel.INCREMENTAL,
                    items,
                    download,
                    fullBytes,
                    summarizeIncremental(items, download, fullBytes)
            );
        }

        DesktopUpdatePlan.Item full = catalog.preferredFull();
        if (full != null) {
            return new DesktopUpdatePlan(
                    DesktopUpdatePlan.Channel.FULL,
                    List.of(full),
                    full.bytes() > 0 ? full.bytes() : fullBytes,
                    fullBytes,
                    "Full package"
            );
        }
        return DesktopUpdatePlan.none();
    }

    private static boolean runtimeChanged(DesktopLocalVersion local, DesktopLocalVersion remote) {
        if (local == null || remote == null) {
            return false;
        }
        if (!local.hasRuntimeId() || !remote.hasRuntimeId()) {
            return false;
        }
        return !local.runtimeId().equals(remote.runtimeId());
    }

    private static String summarizeIncremental(List<DesktopUpdatePlan.Item> items, long download, long full) {
        StringBuilder kinds = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) {
                kinds.append('+');
            }
            kinds.append(items.get(i).kind());
        }
        if (full > download && download > 0L) {
            return "Incremental " + kinds + " (~" + formatMb(download) + " instead of ~" + formatMb(full) + ")";
        }
        return "Incremental " + kinds + (download > 0L ? " (~" + formatMb(download) + ")" : "");
    }

    static String formatMb(long bytes) {
        if (bytes <= 0L) {
            return "0 MB";
        }
        double mb = bytes / (1024.0 * 1024.0);
        if (mb >= 100) {
            return String.format(Locale.ROOT, "%.0f MB", mb);
        }
        if (mb >= 10) {
            return String.format(Locale.ROOT, "%.1f MB", mb);
        }
        return String.format(Locale.ROOT, "%.2f MB", mb);
    }

    private static final class Catalog {
        private DesktopUpdatePlan.Item frontend;
        private DesktopUpdatePlan.Item serverJar;
        private DesktopUpdatePlan.Item preferredInstaller;
        private DesktopUpdatePlan.Item otherInstaller;
        private DesktopUpdatePlan.Item zipFallback;

        static Catalog fromRelease(JsonObject release, String platformKey) {
            Catalog catalog = new Catalog();
            if (release == null || !release.has("assets") || !release.get("assets").isJsonArray()) {
                return catalog;
            }
            String osToken = osTokenFromPlatform(platformKey);
            JsonArray assets = release.getAsJsonArray("assets");
            for (JsonElement el : assets) {
                if (!el.isJsonObject()) {
                    continue;
                }
                JsonObject obj = el.getAsJsonObject();
                if (!obj.has("name") || !obj.has("browser_download_url")) {
                    continue;
                }
                String rawName = obj.get("name").getAsString();
                String name;
                try {
                    name = DesktopUpdaterService.sanitizeAssetFileName(rawName);
                } catch (IllegalArgumentException ex) {
                    continue;
                }
                String url = obj.get("browser_download_url").getAsString();
                String digest = DesktopUpdaterService.assetDigestSha256Public(obj);
                long size = obj.has("size") && obj.get("size").isJsonPrimitive()
                        ? Math.max(0L, obj.get("size").getAsLong())
                        : 0L;
                String lower = name.toLowerCase(Locale.ROOT);
                if (DesktopFrontendDistUpdater.isFrontendDistZipName(name)) {
                    catalog.frontend = new DesktopUpdatePlan.Item("frontend-dist", name, url, digest, size);
                    continue;
                }
                if (DesktopServerJarUpdater.isServerJarUpdateName(name)) {
                    catalog.serverJar = new DesktopUpdatePlan.Item("server-jar", name, url, digest, size);
                    continue;
                }
                if (isVersionManifestName(lower)) {
                    continue;
                }
                if (!lower.contains(osToken) && !isBareInstallerName(lower, osToken)) {
                    continue;
                }
                DesktopUpdatePlan.Item asset = new DesktopUpdatePlan.Item(
                        isPreferredInstaller(lower, osToken) ? "installer"
                                : (lower.endsWith(".zip") ? "portable-zip" : "installer"),
                        name,
                        url,
                        digest,
                        size
                );
                if (isPreferredInstaller(lower, osToken)) {
                    catalog.preferredInstaller = asset;
                } else if (isInstallerAsset(lower, osToken) && catalog.otherInstaller == null) {
                    catalog.otherInstaller = asset;
                } else if (lower.endsWith(".zip") && lower.contains(osToken) && catalog.zipFallback == null) {
                    catalog.zipFallback = asset;
                }
            }
            return catalog;
        }

        DesktopUpdatePlan.Item preferredFull() {
            if (preferredInstaller != null) {
                return preferredInstaller;
            }
            if (otherInstaller != null) {
                return otherInstaller;
            }
            return zipFallback;
        }

        long preferredFullBytes() {
            DesktopUpdatePlan.Item full = preferredFull();
            return full == null ? 0L : Math.max(0L, full.bytes());
        }
    }

    static boolean isVersionManifestName(String lower) {
        return "version.json".equals(lower)
                || lower.startsWith("version-") && lower.endsWith(".json")
                || lower.startsWith("size-report");
    }

    static String osTokenFromPlatform(String platformKey) {
        if (platformKey != null && platformKey.contains("-")) {
            return platformKey.substring(0, platformKey.indexOf('-')).toLowerCase(Locale.ROOT);
        }
        return DesktopUpdaterService.platformZipTokenPublic();
    }

    private static boolean isPreferredInstaller(String lower, String osToken) {
        return switch (osToken) {
            case "windows" ->
                    (lower.endsWith(".exe") || lower.endsWith(".msi"))
                            && (lower.contains("setup") || lower.contains("installer"));
            case "macos" -> lower.endsWith(".dmg");
            case "linux" -> lower.endsWith(".deb");
            default -> false;
        };
    }

    private static boolean isInstallerAsset(String lower, String osToken) {
        return switch (osToken) {
            case "windows" -> lower.endsWith(".exe") || lower.endsWith(".msi");
            case "macos" -> lower.endsWith(".dmg") || lower.endsWith(".pkg");
            case "linux" -> lower.endsWith(".deb") || lower.endsWith(".rpm");
            default -> false;
        };
    }

    private static boolean isBareInstallerName(String lower, String osToken) {
        return isInstallerAsset(lower, osToken)
                && !lower.contains("windows")
                && !lower.contains("macos")
                && !lower.contains("linux");
    }
}
