package org.apache.datawise.desktop.updater;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.datawise.desktop.DesktopPaths;

import java.awt.Desktop;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Desktop updater (About panel check / download / quit-and-install):
 * check GitHub Releases → download installer asset → quitAndInstall opens/runs it.
 * Current version prefers packaged {@code local_version.json} when present.
 *
 * <p>Path traversal on asset names is rejected; download targets must stay under the updates dir.
 * {@code DATAWISE_GITHUB_REPO} / {@code -Ddatawise.github.repo} are accepted only when they match
 * {@code owner/repo}. When a release provides a SHA-256 digest (asset {@code digest} or body text),
 * the downloaded file must match before install/execute.
 *
 * <p>TODO(DT-04): add Ed25519 / release-signature verification once signed artifacts ship.
 */
public final class DesktopUpdaterService {
    /** Build-time fallback when {@code local_version.json} is absent (dev / unpackaged). */
    public static final String CURRENT_VERSION = "5.0.0";

    /**
     * Canonical update channel (must stay stable so installed clients keep receiving Releases).
     * Override with {@code DATAWISE_GITHUB_REPO} or {@code -Ddatawise.github.repo=owner/name}
     * only when the value matches {@link #GITHUB_SLUG_PATTERN}.
     */
    private static final String DEFAULT_GITHUB_SLUG = "gouyehappy/datawise-cli";
    private static final Pattern GITHUB_SLUG_PATTERN = Pattern.compile("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$");
    private static final Pattern BODY_SHA256_PATTERN = Pattern.compile(
            "(?i)(?:sha[-_ ]?256|checksum)\\s*[:=]\\s*`?([a-f0-9]{64})`?");

    public static String githubSlug() {
        String candidate = firstNonBlank(System.getenv("DATAWISE_GITHUB_REPO"),
                System.getProperty("datawise.github.repo", ""));
        if (candidate != null && GITHUB_SLUG_PATTERN.matcher(candidate).matches()) {
            return candidate;
        }
        if (candidate != null) {
            System.err.println("[datawise-desktop] ignoring invalid github repo override; using "
                    + DEFAULT_GITHUB_SLUG);
        }
        return DEFAULT_GITHUB_SLUG;
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) {
            return a.trim();
        }
        if (b != null && !b.isBlank()) {
            return b.trim();
        }
        return null;
    }

    private static String releasesApi() {
        String slug = githubSlug();
        return slug.isEmpty() ? "" : "https://api.github.com/repos/" + slug + "/releases/latest";
    }

    private static String releasesPage() {
        String slug = githubSlug();
        return slug.isEmpty() ? "" : "https://github.com/" + slug + "/releases/latest";
    }

    private final String currentVersion;
    private final AtomicReference<JsonObject> lastStatus = new AtomicReference<>();
    private final AtomicReference<JsonObject> latestRelease = new AtomicReference<>();
    private final AtomicReference<Path> downloadedInstaller = new AtomicReference<>();
    private final AtomicReference<String> downloadedKind = new AtomicReference<>("installer");
    private final AtomicReference<String> expectedSha256 = new AtomicReference<>();
    private final List<Consumer<JsonObject>> listeners = new CopyOnWriteArrayList<>();
    private volatile boolean notifyOnUpdate = true;
    private volatile boolean autoDownload = false;
    /** Optional: reload CEF after frontend-dist apply (avoids full process restart). */
    private volatile Runnable afterFrontendApply;
    /** Optional: full process relaunch after server-jar apply. */
    private volatile Runnable relaunchHandler;

    public DesktopUpdaterService() {
        this.currentVersion = resolveCurrentVersion();
        lastStatus.set(baseStatus(false, false, null));
    }

    public String currentVersion() {
        return currentVersion;
    }

    public void setAfterFrontendApply(Runnable afterFrontendApply) {
        this.afterFrontendApply = afterFrontendApply;
    }

    public void setRelaunchHandler(Runnable relaunchHandler) {
        this.relaunchHandler = relaunchHandler;
    }

    public void addListener(Consumer<JsonObject> listener) {
        listeners.add(listener);
    }

    public JsonObject getStatus() {
        return lastStatus.get().deepCopy();
    }

    public void setPreferences(boolean notifyOnUpdate, boolean autoDownload) {
        this.notifyOnUpdate = notifyOnUpdate;
        this.autoDownload = autoDownload;
    }

    public JsonObject checkForUpdates() {
        try {
            String api = releasesApi();
            if (api.isEmpty()) {
                return publishError("GitHub repo not configured");
            }
            HttpURLConnection conn = (HttpURLConnection) URI.create(api).toURL().openConnection();
            conn.setRequestProperty("Accept", "application/vnd.github+json");
            conn.setRequestProperty("User-Agent", "DataWiseCLI/" + currentVersion);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                return publishError("GitHub Releases returned HTTP " + code);
            }
            JsonObject release = JsonParser.parseReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)).getAsJsonObject();
            latestRelease.set(release);
            String tag = release.has("tag_name") ? release.get("tag_name").getAsString() : currentVersion;
            String latest = tag.startsWith("v") ? tag.substring(1) : tag;
            boolean hasUpdate = compareSemver(latest, currentVersion) > 0;
            JsonObject status = baseStatus(hasUpdate, false, null);
            status.addProperty("latestVersion", latest);
            status.addProperty("downloadReady", downloadedInstaller.get() != null);
            status.addProperty("downloading", false);
            status.addProperty("updateKind", downloadedKind.get());
            lastStatus.set(status);
            emitPhase(hasUpdate ? "available" : "not-available", latest, null, null);
            if (hasUpdate && autoDownload) {
                return downloadUpdate();
            }
            return status.deepCopy();
        } catch (Exception e) {
            return publishError(e.getMessage());
        }
    }

    public JsonObject downloadUpdate() {
        JsonObject release = latestRelease.get();
        if (release == null) {
            checkForUpdates();
            release = latestRelease.get();
        }
        if (release == null) {
            return publishError("No release metadata; check for updates first");
        }
        String latest = lastStatus.get().has("latestVersion")
                ? lastStatus.get().get("latestVersion").getAsString()
                : currentVersion;
        Asset asset = pickPlatformAsset(release);
        if (asset == null) {
            // Fall back to opening the release page when no installer asset exists yet.
            emitPhase("downloaded", latest, 100.0, null);
            String page = releasesPage();
            if (!page.isEmpty()) {
                openBrowser(page);
            }
            JsonObject status = lastStatus.get().deepCopy();
            status.addProperty("downloadReady", true);
            status.addProperty("downloading", false);
            status.addProperty("hasUpdate", true);
            lastStatus.set(status);
            return status.deepCopy();
        }

        JsonObject downloading = lastStatus.get().deepCopy();
        downloading.addProperty("downloading", true);
        downloading.addProperty("hasUpdate", true);
        lastStatus.set(downloading);
        emitPhase("downloading", latest, 0.0, null);

        try {
            Path dir = DesktopPaths.userDataDir().resolve("updates").toAbsolutePath().normalize();
            Files.createDirectories(dir);
            Path target = resolveSafeDownloadTarget(dir, asset.name());
            downloadFile(asset.url(), target, latest);
            String expected = resolveExpectedSha256(release, asset);
            if (expected != null) {
                String actual = sha256Hex(target);
                if (!expected.equalsIgnoreCase(actual)) {
                    Files.deleteIfExists(target);
                    expectedSha256.set(null);
                    return publishError("Update checksum mismatch (SHA-256)");
                }
            } else {
                System.err.println("[datawise-desktop] update asset has no SHA-256 digest; "
                        + "install will proceed without hash verify (TODO: release signatures)");
            }
            expectedSha256.set(expected);
            downloadedInstaller.set(target);
            downloadedKind.set(asset.kind());
            JsonObject status = baseStatus(true, false, null);
            status.addProperty("latestVersion", latest);
            status.addProperty("downloadReady", true);
            status.addProperty("downloading", false);
            status.addProperty("installerPath", target.toString());
            status.addProperty("updateKind", asset.kind());
            lastStatus.set(status);
            emitPhase("downloaded", latest, 100.0, null);
            return status.deepCopy();
        } catch (Exception e) {
            return publishError("Download failed: " + e.getMessage());
        }
    }

    public boolean quitAndInstall() {
        Path installer = downloadedInstaller.get();
        String kind = downloadedKind.get();
        try {
            if (installer != null && Files.isRegularFile(installer)) {
                verifyDownloadedIntegrity(installer);
                String fileName = installer.getFileName().toString();
                if (DesktopFrontendDistUpdater.isFrontendDistZipName(fileName)) {
                    DesktopFrontendDistUpdater.apply(installer);
                    emitPhase("applied", latestOrCurrent(), 100.0, null);
                    Runnable reload = afterFrontendApply;
                    if (reload != null) {
                        reload.run();
                    } else {
                        relaunchOrExit();
                    }
                    return true;
                }
                if (DesktopServerJarUpdater.isServerJarUpdateName(fileName) || "server-jar".equals(kind)) {
                    DesktopServerJarUpdater.apply(installer);
                    emitPhase("applied", latestOrCurrent(), 100.0, null);
                    relaunchOrExit();
                    return true;
                }
            }
            if (installer != null && Files.isRegularFile(installer)) {
                verifyDownloadedIntegrity(installer);
                String name = installer.getFileName().toString().toLowerCase(Locale.ROOT);
                String abs = installer.toAbsolutePath().normalize().toString();
                if (name.endsWith(".zip")) {
                    openExplorer(installer.getParent());
                    return true;
                }
                if (name.endsWith(".dmg")) {
                    new ProcessBuilder("open", abs).start();
                    return true;
                }
                if (name.endsWith(".deb")) {
                    new ProcessBuilder("xdg-open", abs).start();
                    return true;
                }
                // Windows Setup.exe / .msi — only after optional SHA-256 gate above.
                new ProcessBuilder(abs).start();
                return true;
            }
            String page = releasesPage();
            if (!page.isEmpty()) {
                openBrowser(page);
            }
            return true;
        } catch (Exception e) {
            publishError("Install failed: " + e.getMessage());
            return false;
        }
    }

    private String latestOrCurrent() {
        return lastStatus.get().has("latestVersion")
                ? lastStatus.get().get("latestVersion").getAsString()
                : currentVersion;
    }

    private void relaunchOrExit() {
        Runnable relaunch = relaunchHandler;
        if (relaunch != null) {
            relaunch.run();
        } else {
            org.apache.datawise.desktop.process.ProcessRelauncher.relaunch(null);
        }
    }

    private static void openExplorer(Path dir) {
        try {
            if (dir == null) return;
            if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
                new ProcessBuilder("explorer.exe", dir.toAbsolutePath().toString()).start();
            } else if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().open(dir.toFile());
            }
        } catch (Exception ignored) {
        }
    }

    private void downloadFile(String url, Path target, String latest) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", "DataWiseCLI/" + currentVersion);
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(120_000);
        long total = conn.getContentLengthLong();
        try (InputStream in = conn.getInputStream()) {
            byte[] buf = new byte[64 * 1024];
            long read = 0;
            Path tmp = target.resolveSibling(target.getFileName() + ".part");
            try (var out = Files.newOutputStream(tmp)) {
                int n;
                while ((n = in.read(buf)) >= 0) {
                    out.write(buf, 0, n);
                    read += n;
                    if (total > 0) {
                        double pct = Math.min(99.0, (read * 100.0) / total);
                        emitPhase("downloading", latest, pct, null);
                    }
                }
            }
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static Asset pickPlatformAsset(JsonObject release) {
        if (!release.has("assets") || !release.get("assets").isJsonArray()) {
            return null;
        }
        String osToken = platformZipToken();
        JsonArray assets = release.getAsJsonArray("assets");
        Asset frontendDist = null;
        Asset serverJar = null;
        Asset preferredInstaller = null;
        Asset otherInstaller = null;
        Asset zipFallback = null;
        for (JsonElement el : assets) {
            if (!el.isJsonObject()) continue;
            JsonObject obj = el.getAsJsonObject();
            if (!obj.has("name") || !obj.has("browser_download_url")) continue;
            String rawName = obj.get("name").getAsString();
            String name;
            try {
                name = sanitizeAssetFileName(rawName);
            } catch (IllegalArgumentException ex) {
                continue;
            }
            String url = obj.get("browser_download_url").getAsString();
            String digest = assetDigestSha256(obj);
            String lower = name.toLowerCase(Locale.ROOT);
            if (DesktopFrontendDistUpdater.isFrontendDistZipName(name)) {
                frontendDist = new Asset(name, url, "frontend-dist", digest);
                continue;
            }
            if (DesktopServerJarUpdater.isServerJarUpdateName(name)) {
                serverJar = new Asset(name, url, "server-jar", digest);
                continue;
            }
            if (!lower.contains(osToken) && !isBareInstallerName(lower, osToken)) {
                continue;
            }
            Asset asset = new Asset(name, url, "installer", digest);
            if (isPreferredInstaller(lower, osToken)) {
                preferredInstaller = asset;
                // keep scanning for incremental assets
            } else if (isInstallerAsset(lower, osToken) && otherInstaller == null) {
                otherInstaller = asset;
            } else if (lower.endsWith(".zip") && lower.contains(osToken) && zipFallback == null) {
                zipFallback = new Asset(name, url, "portable-zip", digest);
            }
        }
        // Prefer incremental patches over full installer (D-04).
        // FE-only and server-only releases apply without downloading Setup.exe / .dmg.
        // When both patches ship, prefer frontend-dist (reload) over server-jar (relaunch).
        if (frontendDist != null) {
            return frontendDist;
        }
        if (serverJar != null) {
            return serverJar;
        }
        if (preferredInstaller != null) {
            return preferredInstaller;
        }
        if (otherInstaller != null) {
            return otherInstaller;
        }
        return zipFallback;
    }

    /** Test hook for {@link #pickPlatformAsset(JsonObject)}. */
    static String selectUpdateKind(JsonObject release) {
        Asset asset = pickPlatformAsset(release);
        return asset == null ? null : asset.kind();
    }

    /** Prefer setup.exe / .dmg / .deb over portable zip. */
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

    /** Allow installer names that omit the os token (e.g. DataWiseCLI-4.1.6.dmg). */
    private static boolean isBareInstallerName(String lower, String osToken) {
        return isInstallerAsset(lower, osToken)
                && !lower.contains("windows")
                && !lower.contains("macos")
                && !lower.contains("linux");
    }

    private static String platformZipToken() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            return "windows";
        }
        if (os.contains("mac")) {
            return "macos";
        }
        return "linux";
    }

    private static void openBrowser(String url) {
        try {
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().browse(URI.create(url));
            }
        } catch (Exception ignored) {
        }
    }

    private JsonObject publishError(String message) {
        JsonObject status = baseStatus(false, false, message);
        lastStatus.set(status);
        emitPhase("error", currentVersion, null, message);
        return status.deepCopy();
    }

    private void emitPhase(String phase, String latest, Double percent, String error) {
        JsonObject event = new JsonObject();
        event.addProperty("phase", phase);
        event.addProperty("currentVersion", currentVersion);
        event.addProperty("latestVersion", latest == null ? currentVersion : latest);
        if (percent != null) {
            event.addProperty("percent", percent);
        }
        if (error != null) {
            event.addProperty("error", error);
        }
        for (Consumer<JsonObject> listener : listeners) {
            try {
                listener.accept(event);
            } catch (Exception ignored) {
            }
        }
    }

    private JsonObject baseStatus(boolean hasUpdate, boolean downloading, String error) {
        JsonObject status = new JsonObject();
        status.addProperty("currentVersion", currentVersion);
        status.addProperty("latestVersion", currentVersion);
        status.addProperty("hasUpdate", hasUpdate);
        status.addProperty("downloadReady", false);
        status.addProperty("downloading", downloading);
        status.addProperty("updateKind", downloadedKind.get() == null ? "installer" : downloadedKind.get());
        if (error != null) {
            status.addProperty("error", error);
        }
        return status;
    }

    /** Prefer packaged local_version.json; fall back to {@link #CURRENT_VERSION}. */
    public static String resolveCurrentVersion() {
        for (Path candidate : localVersionCandidates()) {
            String version = readVersionField(candidate);
            if (version != null && !version.isBlank()) {
                return version.trim();
            }
        }
        return CURRENT_VERSION;
    }

    static List<Path> localVersionCandidates() {
        Path install = DesktopPaths.installRoot();
        return List.of(
                install.resolve("local_version.json"),
                install.resolve("resources").resolve("local_version.json"),
                install.resolve("Contents").resolve("local_version.json"),
                install.resolve("DataWiseCLI.app").resolve("Contents").resolve("local_version.json")
        );
    }

    static String readVersionField(Path path) {
        if (path == null || !Files.isRegularFile(path)) {
            return null;
        }
        try {
            JsonObject obj = JsonParser.parseReader(
                    new InputStreamReader(Files.newInputStream(path), StandardCharsets.UTF_8)).getAsJsonObject();
            if (obj.has("version") && obj.get("version").isJsonPrimitive()) {
                return obj.get("version").getAsString();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    static int compareSemver(String a, String b) {
        int[] pa = parse(a);
        int[] pb = parse(b);
        for (int i = 0; i < 3; i++) {
            if (pa[i] != pb[i]) {
                return Integer.compare(pa[i], pb[i]);
            }
        }
        return 0;
    }

    private static int[] parse(String version) {
        String normalized = version == null ? "" : version.trim();
        if (normalized.startsWith("v") || normalized.startsWith("V")) {
            normalized = normalized.substring(1);
        }
        String[] parts = normalized.split("[^0-9]+");
        int[] out = new int[3];
        int filled = 0;
        for (String part : parts) {
            if (part == null || part.isBlank()) {
                continue;
            }
            if (filled >= 3) {
                break;
            }
            out[filled++] = Integer.parseInt(part);
        }
        return out;
    }

    /**
     * Basename-only asset names; rejects empty, separators, and {@code ..} segments.
     */
    static String sanitizeAssetFileName(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("empty_asset_name");
        }
        String normalized = raw.trim().replace('\\', '/');
        int slash = normalized.lastIndexOf('/');
        String base = slash >= 0 ? normalized.substring(slash + 1) : normalized;
        // Reject path-segment traversal names only (basename may still contain dots).
        if (base.isBlank() || ".".equals(base) || "..".equals(base)) {
            throw new IllegalArgumentException("unsafe_asset_name");
        }
        if (base.indexOf('/') >= 0 || base.indexOf('\\') >= 0) {
            throw new IllegalArgumentException("unsafe_asset_name");
        }
        return base;
    }

    static Path resolveSafeDownloadTarget(Path updatesDir, String assetName) {
        Path dir = updatesDir.toAbsolutePath().normalize();
        String safeName = sanitizeAssetFileName(assetName);
        Path target = dir.resolve(safeName).normalize();
        if (!target.startsWith(dir)) {
            throw new IllegalArgumentException("download_path_escape");
        }
        return target;
    }

    private void verifyDownloadedIntegrity(Path installer) throws Exception {
        String expected = expectedSha256.get();
        if (expected == null || expected.isBlank()) {
            return;
        }
        String actual = sha256Hex(installer);
        if (!expected.equalsIgnoreCase(actual)) {
            throw new IllegalStateException("Update checksum mismatch (SHA-256)");
        }
    }

    private static String resolveExpectedSha256(JsonObject release, Asset asset) {
        if (asset != null && asset.sha256() != null && !asset.sha256().isBlank()) {
            return asset.sha256().toLowerCase(Locale.ROOT);
        }
        if (release == null || !release.has("body") || release.get("body").isJsonNull()) {
            return null;
        }
        String body = release.get("body").getAsString();
        if (body == null || body.isBlank()) {
            return null;
        }
        Matcher matcher = BODY_SHA256_PATTERN.matcher(body);
        if (matcher.find()) {
            return matcher.group(1).toLowerCase(Locale.ROOT);
        }
        // Also accept a bare 64-hex line mentioning the asset name nearby.
        if (asset != null && asset.name() != null) {
            Pattern named = Pattern.compile(
                    "(?i)" + Pattern.quote(asset.name()) + "[^\\n]{0,120}?([a-f0-9]{64})"
                            + "|([a-f0-9]{64})[^\\n]{0,120}?" + Pattern.quote(asset.name()));
            Matcher namedMatcher = named.matcher(body);
            if (namedMatcher.find()) {
                String hex = namedMatcher.group(1) != null ? namedMatcher.group(1) : namedMatcher.group(2);
                return hex.toLowerCase(Locale.ROOT);
            }
        }
        return null;
    }

    private static String assetDigestSha256(JsonObject assetObj) {
        if (assetObj == null || !assetObj.has("digest") || assetObj.get("digest").isJsonNull()) {
            return null;
        }
        String digest = assetObj.get("digest").getAsString();
        if (digest == null || digest.isBlank()) {
            return null;
        }
        digest = digest.trim();
        int colon = digest.indexOf(':');
        String algo = colon > 0 ? digest.substring(0, colon).trim() : "sha256";
        String hex = colon > 0 ? digest.substring(colon + 1).trim() : digest.trim();
        if (!"sha256".equalsIgnoreCase(algo) && !"sha-256".equalsIgnoreCase(algo)) {
            return null;
        }
        if (!hex.matches("(?i)[a-f0-9]{64}")) {
            return null;
        }
        return hex.toLowerCase(Locale.ROOT);
    }

    static String sha256Hex(Path file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) >= 0) {
                digest.update(buf, 0, n);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private record Asset(String name, String url, String kind, String sha256) {
    }
}
