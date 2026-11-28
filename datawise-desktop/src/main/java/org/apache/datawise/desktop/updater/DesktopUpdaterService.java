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
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Desktop updater: check GitHub Releases → prefer component incremental packs
 * ({@code frontend-dist} / {@code server-jar}) so the ~400&nbsp;MB JCEF runtime is not
 * re-downloaded → quitAndInstall applies packs or launches a full installer.
 *
 * <p>Path traversal on asset names is rejected; download targets stay under the updates dir.
 * When a release provides a SHA-256 digest, the downloaded file must match before apply.
 *
 * <p>TODO(DT-04): add Ed25519 / release-signature verification once signed artifacts ship.
 */
public final class DesktopUpdaterService {
    /** Build-time fallback when {@code local_version.json} is absent (dev / unpackaged). */
    public static final String CURRENT_VERSION = "5.0.1";

    private static final String DEFAULT_GITHUB_SLUG = "gouyehappy/datawise-cli";
    private static final Pattern GITHUB_SLUG_PATTERN = Pattern.compile("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$");
    private static final Pattern BODY_SHA256_PATTERN = Pattern.compile(
            "(?i)(?:sha[-_ ]?256|checksum)\\s*[:=]\\s*`?([a-f0-9]{64})`?");
    private static final int MAX_NOTES_CHARS = 4_000;

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
    /**
     * Automatic / quiet checks hit GitHub at most once per hour.
     * Manual About-button checks pass {@code force=true} and are unlimited.
     */
    static final long CHECK_INTERVAL_MS = 60L * 60L * 1000L;

    private final AtomicReference<DesktopUpdatePlan> plannedUpdate = new AtomicReference<>(DesktopUpdatePlan.none());
    private final AtomicReference<List<StagedAsset>> stagedAssets = new AtomicReference<>(List.of());
    private final AtomicReference<Long> lastNetworkCheckAt = new AtomicReference<>(0L);
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
        restoreCheckState();
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

    /** Default check — respects the once-per-hour automatic throttle. */
    public JsonObject checkForUpdates() {
        return checkForUpdates(false);
    }

    /**
     * @param force when {@code true} (manual button), bypass the hourly throttle and hit GitHub
     */
    public JsonObject checkForUpdates(boolean force) {
        try {
            long now = System.currentTimeMillis();
            Long lastAt = lastNetworkCheckAt.get();
            if (!force && lastAt != null && lastAt > 0L && (now - lastAt) < CHECK_INTERVAL_MS) {
                JsonObject cached = lastStatus.get().deepCopy();
                cached.addProperty("cached", true);
                cached.addProperty("checkedAt", lastAt);
                cached.addProperty("nextCheckAt", lastAt + CHECK_INTERVAL_MS);
                cached.addProperty("checkIntervalMs", CHECK_INTERVAL_MS);
                // Keep last error out of a healthy cached "already checked this hour" response.
                if (!cached.has("error") || cached.get("error").isJsonNull()) {
                    cached.remove("error");
                }
                lastStatus.set(cached.deepCopy());
                String latest = cached.has("latestVersion")
                        ? cached.get("latestVersion").getAsString()
                        : currentVersion;
                boolean hasUpdate = cached.has("hasUpdate") && cached.get("hasUpdate").getAsBoolean();
                emitPhase(hasUpdate ? "available" : "not-available", latest, null, null, plannedUpdate.get(), null);
                return cached;
            }

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

            DesktopLocalVersion local = DesktopLocalVersion.readInstalled();
            String platform = platformKey();
            JsonObject versionManifest = fetchVersionManifest(release, platform);
            DesktopUpdatePlan plan = hasUpdate
                    ? DesktopUpdatePlanner.plan(release, versionManifest, local, platform)
                    : DesktopUpdatePlan.none();
            // Newer version but planner found nothing (identical fingerprints) — still surface as up-to-date.
            if (hasUpdate && plan.isEmpty()) {
                hasUpdate = false;
            }
            plannedUpdate.set(plan);
            stagedAssets.set(List.of());

            JsonObject status = statusFromPlan(hasUpdate, latest, plan, false, null);
            status.addProperty("releaseNotes", truncateNotes(releaseNotes(release)));
            status.addProperty("cached", false);
            status.addProperty("checkedAt", now);
            status.addProperty("nextCheckAt", now + CHECK_INTERVAL_MS);
            status.addProperty("checkIntervalMs", CHECK_INTERVAL_MS);
            lastNetworkCheckAt.set(now);
            lastStatus.set(status);
            persistCheckState(release, versionManifest, status, now);
            emitPhase(hasUpdate ? "available" : "not-available", latest, null, null, plan, null);
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
            // Prefer a fresh network check so download has release metadata; force bypasses cache.
            checkForUpdates(true);
            release = latestRelease.get();
        }
        if (release == null) {
            return publishError("No release metadata; check for updates first");
        }
        String latest = lastStatus.get().has("latestVersion")
                ? lastStatus.get().get("latestVersion").getAsString()
                : currentVersion;
        // Always re-plan with the live version manifest so a restored check-state
        // (which may lack fingerprints) cannot over-download every incremental pack.
        DesktopLocalVersion local = DesktopLocalVersion.readInstalled();
        String platform = platformKey();
        JsonObject versionManifest = fetchVersionManifest(release, platform);
        DesktopUpdatePlan resolved = DesktopUpdatePlanner.plan(release, versionManifest, local, platform);
        plannedUpdate.set(resolved);
        final DesktopUpdatePlan plan = resolved;
        if (plan.isEmpty()) {
            emitPhase("downloaded", latest, 100.0, null, plan, null);
            String page = releasesPage();
            if (!page.isEmpty()) {
                openBrowser(page);
            }
            JsonObject status = statusFromPlan(true, latest, plan, false, null);
            status.addProperty("downloadReady", true);
            lastStatus.set(status);
            return status.deepCopy();
        }

        JsonObject downloading = statusFromPlan(true, latest, plan, true, null);
        lastStatus.set(downloading);
        emitPhase("downloading", latest, 0.0, null, plan, null);

        try {
            Path dir = DesktopPaths.userDataDir().resolve("updates").toAbsolutePath().normalize();
            Files.createDirectories(dir);
            List<DesktopUpdatePlan.Item> items = plan.items();
            long totalBytes = Math.max(1L, plan.downloadBytes());
            long completedBytes = 0L;
            List<StagedAsset> staged = new ArrayList<>(items.size());
            for (int i = 0; i < items.size(); i++) {
                DesktopUpdatePlan.Item item = items.get(i);
                Path target = resolveSafeDownloadTarget(dir, item.name());
                long knownSize = item.bytes() > 0 ? item.bytes() : 0L;
                long base = completedBytes;
                final String activeKind = item.kind();
                downloadFile(item.url(), target, latest, plan, activeKind, (read, contentLen) -> {
                    long piece = contentLen > 0 ? contentLen : Math.max(knownSize, read);
                    double pct = Math.min(99.0, ((base + read) * 100.0) / Math.max(totalBytes, piece + base));
                    emitPhase("downloading", latest, pct, null, plan, activeKind);
                });
                String expected = resolveExpectedSha256(release, item);
                if (expected != null) {
                    String actual = sha256Hex(target);
                    if (!expected.equalsIgnoreCase(actual)) {
                        Files.deleteIfExists(target);
                        return publishError("Update checksum mismatch (SHA-256) for " + item.name());
                    }
                } else {
                    System.err.println("[datawise-desktop] update asset has no SHA-256 digest; "
                            + "install will proceed without hash verify (TODO: release signatures): "
                            + item.name());
                }
                long size = Files.size(target);
                completedBytes += size > 0 ? size : knownSize;
                staged.add(new StagedAsset(item.kind(), target, expected, size));
            }
            stagedAssets.set(List.copyOf(staged));
            JsonObject status = statusFromPlan(true, latest, plan, false, null);
            status.addProperty("downloadReady", true);
            status.addProperty("releaseNotes", truncateNotes(releaseNotes(release)));
            lastStatus.set(status);
            emitPhase("downloaded", latest, 100.0, null, plan, null);
            return status.deepCopy();
        } catch (Exception e) {
            stagedAssets.set(List.of());
            return publishError("Download failed: " + e.getMessage());
        }
    }

    /**
     * Apply staged packs or launch the full installer.
     *
     * @return JSON {@code {ok, restartRequired, channel, installAction, applied[]}}
     */
    public JsonObject quitAndInstall() {
        JsonObject result = new JsonObject();
        result.addProperty("ok", false);
        result.addProperty("restartRequired", false);
        DesktopUpdatePlan plan = plannedUpdate.get();
        List<StagedAsset> staged = stagedAssets.get();
        try {
            if (staged == null || staged.isEmpty()) {
                String page = releasesPage();
                if (!page.isEmpty()) {
                    openBrowser(page);
                }
                result.addProperty("ok", true);
                result.addProperty("restartRequired", false);
                result.addProperty("channel", "none");
                result.addProperty("installAction", "none");
                result.add("applied", new JsonArray());
                return result;
            }

            if (plan != null && plan.channel() == DesktopUpdatePlan.Channel.FULL) {
                StagedAsset only = staged.get(0);
                verifyStaged(only);
                launchFullPackage(only.path());
                result.addProperty("ok", true);
                result.addProperty("restartRequired", true);
                result.addProperty("channel", "full");
                result.addProperty("installAction", "installer");
                JsonArray applied = new JsonArray();
                applied.add(only.kind());
                result.add("applied", applied);
                emitPhase("applied", latestOrCurrent(), 100.0, null, plan, only.kind());
                return result;
            }

            // Incremental: server-jar then frontend-dist.
            List<String> appliedKinds = new ArrayList<>();
            boolean appliedServer = false;
            boolean appliedFrontend = false;
            for (StagedAsset asset : staged) {
                verifyStaged(asset);
                if ("server-jar".equals(asset.kind())) {
                    DesktopServerJarUpdater.apply(asset.path());
                    appliedServer = true;
                    appliedKinds.add("server-jar");
                } else if ("frontend-dist".equals(asset.kind())) {
                    DesktopFrontendDistUpdater.apply(asset.path());
                    appliedFrontend = true;
                    appliedKinds.add("frontend-dist");
                } else {
                    launchFullPackage(asset.path());
                    result.addProperty("ok", true);
                    result.addProperty("restartRequired", true);
                    result.addProperty("channel", "full");
                    result.addProperty("installAction", "installer");
                    JsonArray applied = new JsonArray();
                    applied.add(asset.kind());
                    result.add("applied", applied);
                    return result;
                }
            }

            DesktopUpdatePlan.InstallAction action = appliedServer
                    ? DesktopUpdatePlan.InstallAction.RESTART
                    : DesktopUpdatePlan.InstallAction.RELOAD;
            result.addProperty("ok", true);
            result.addProperty("restartRequired", action == DesktopUpdatePlan.InstallAction.RESTART);
            result.addProperty("channel", "incremental");
            result.addProperty("installAction", action.name().toLowerCase(Locale.ROOT));
            JsonArray applied = new JsonArray();
            for (String kind : appliedKinds) {
                applied.add(kind);
            }
            result.add("applied", applied);
            stagedAssets.set(List.of());
            plannedUpdate.set(DesktopUpdatePlan.none());
            JsonObject cleared = lastStatus.get().deepCopy();
            cleared.addProperty("hasUpdate", false);
            cleared.addProperty("downloadReady", false);
            cleared.addProperty("updateChannel", "none");
            cleared.addProperty("installAction", "none");
            lastStatus.set(cleared);
            emitPhase("applied", latestOrCurrent(), 100.0, null, DesktopUpdatePlan.none(), null);

            if (action == DesktopUpdatePlan.InstallAction.RESTART) {
                relaunchOrExit();
            } else if (appliedFrontend) {
                Runnable reload = afterFrontendApply;
                if (reload != null) {
                    reload.run();
                } else {
                    relaunchOrExit();
                    result.addProperty("restartRequired", true);
                }
            }
            return result;
        } catch (Exception e) {
            publishError("Install failed: " + e.getMessage());
            result.addProperty("ok", false);
            result.addProperty("error", e.getMessage() == null ? "install_failed" : e.getMessage());
            return result;
        }
    }

    private void launchFullPackage(Path installer) throws Exception {
        String name = installer.getFileName().toString().toLowerCase(Locale.ROOT);
        String abs = installer.toAbsolutePath().normalize().toString();
        if (name.endsWith(".zip")) {
            openExplorer(installer.getParent());
            return;
        }
        if (name.endsWith(".dmg")) {
            new ProcessBuilder("open", abs).start();
            return;
        }
        if (name.endsWith(".deb")) {
            new ProcessBuilder("xdg-open", abs).start();
            return;
        }
        new ProcessBuilder(abs).start();
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
            if (dir == null) {
                return;
            }
            if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
                new ProcessBuilder("explorer.exe", dir.toAbsolutePath().toString()).start();
            } else if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().open(dir.toFile());
            }
        } catch (Exception ignored) {
        }
    }

    private void downloadFile(
            String url,
            Path target,
            String latest,
            DesktopUpdatePlan plan,
            String kind,
            ProgressCallback progress
    ) throws Exception {
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
                    if (progress != null) {
                        progress.onProgress(read, total);
                    } else if (total > 0) {
                        double pct = Math.min(99.0, (read * 100.0) / total);
                        emitPhase("downloading", latest, pct, null, plan, kind);
                    }
                }
            }
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /** Test hook — resolves the update channel for a synthetic release (Windows catalog). */
    static String selectUpdateKind(JsonObject release) {
        DesktopUpdatePlan plan = planFor(
                release, null, new DesktopLocalVersion("0.0.0", "", null, null, null));
        if (plan.isEmpty()) {
            return null;
        }
        if (plan.channel() == DesktopUpdatePlan.Channel.FULL) {
            return plan.items().isEmpty() ? "installer" : plan.items().get(0).kind();
        }
        List<String> kinds = plan.kinds();
        if (kinds.size() == 1) {
            return kinds.get(0);
        }
        if (kinds.contains("frontend-dist") && kinds.contains("server-jar")) {
            return "incremental";
        }
        return kinds.isEmpty() ? null : kinds.get(0);
    }

    /** Test hook for multi-component plans (fixed windows-x64 so CI is OS-agnostic). */
    static DesktopUpdatePlan planFor(JsonObject release, JsonObject versionManifest, DesktopLocalVersion local) {
        return DesktopUpdatePlanner.plan(release, versionManifest, local, "windows-x64");
    }

    private JsonObject fetchVersionManifest(JsonObject release, String platform) {
        if (release == null || !release.has("assets") || !release.get("assets").isJsonArray()) {
            return null;
        }
        String platformName = "version-" + platform + ".json";
        String url = null;
        for (JsonElement el : release.getAsJsonArray("assets")) {
            if (!el.isJsonObject()) {
                continue;
            }
            JsonObject obj = el.getAsJsonObject();
            if (!obj.has("name") || !obj.has("browser_download_url")) {
                continue;
            }
            String name = obj.get("name").getAsString();
            if (platformName.equalsIgnoreCase(name) || "version.json".equalsIgnoreCase(name)) {
                url = obj.get("browser_download_url").getAsString();
                if (platformName.equalsIgnoreCase(name)) {
                    break;
                }
            }
        }
        if (url == null) {
            return null;
        }
        try {
            HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", "DataWiseCLI/" + currentVersion);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                return null;
            }
            return JsonParser.parseReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)).getAsJsonObject();
        } catch (Exception e) {
            return null;
        }
    }

    static String platformKey() {
        return platformZipTokenPublic() + "-" + platformArchToken();
    }

    static String platformZipTokenPublic() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            return "windows";
        }
        if (os.contains("mac")) {
            return "macos";
        }
        return "linux";
    }

    static String platformArchToken() {
        String arch = System.getProperty("os.arch", "").toLowerCase(Locale.ROOT);
        if (arch.contains("aarch64") || arch.contains("arm64")) {
            return "arm64";
        }
        return "x64";
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
        emitPhase("error", currentVersion, null, message, plannedUpdate.get(), null);
        return status.deepCopy();
    }

    private void emitPhase(
            String phase,
            String latest,
            Double percent,
            String error,
            DesktopUpdatePlan plan,
            String activeKind
    ) {
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
        if (activeKind != null) {
            event.addProperty("activeKind", activeKind);
        }
        attachPlanFields(event, plan);
        for (Consumer<JsonObject> listener : listeners) {
            try {
                listener.accept(event);
            } catch (Exception ignored) {
            }
        }
    }

    private JsonObject statusFromPlan(
            boolean hasUpdate,
            String latest,
            DesktopUpdatePlan plan,
            boolean downloading,
            String error
    ) {
        JsonObject status = baseStatus(hasUpdate, downloading, error);
        status.addProperty("latestVersion", latest == null ? currentVersion : latest);
        status.addProperty("downloadReady", !stagedAssets.get().isEmpty());
        attachPlanFields(status, plan);
        return status;
    }

    private void attachPlanFields(JsonObject target, DesktopUpdatePlan plan) {
        DesktopUpdatePlan safe = plan == null ? DesktopUpdatePlan.none() : plan;
        target.addProperty("updateChannel", safe.channelKey());
        target.addProperty("installAction", safe.installActionKey());
        target.addProperty("updateSummary", safe.summary());
        target.addProperty("downloadBytes", safe.downloadBytes());
        target.addProperty("fullPackageBytes", safe.fullPackageBytes());
        target.addProperty("savedBytes", safe.savedBytes());
        JsonArray kinds = new JsonArray();
        for (String kind : safe.kinds()) {
            kinds.add(kind);
        }
        target.add("updateKinds", kinds);
        String primary = safe.kinds().isEmpty() ? "installer" : String.join("+", safe.kinds());
        target.addProperty("updateKind", primary);
    }

    private JsonObject baseStatus(boolean hasUpdate, boolean downloading, String error) {
        JsonObject status = new JsonObject();
        status.addProperty("currentVersion", currentVersion);
        status.addProperty("latestVersion", currentVersion);
        status.addProperty("hasUpdate", hasUpdate);
        status.addProperty("downloadReady", false);
        status.addProperty("downloading", downloading);
        status.addProperty("updateKind", "installer");
        status.addProperty("updateChannel", "none");
        status.addProperty("installAction", "none");
        status.addProperty("updateSummary", "");
        status.addProperty("downloadBytes", 0L);
        status.addProperty("fullPackageBytes", 0L);
        status.addProperty("savedBytes", 0L);
        status.add("updateKinds", new JsonArray());
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

    static String sanitizeAssetFileName(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("empty_asset_name");
        }
        String normalized = raw.trim().replace('\\', '/');
        int slash = normalized.lastIndexOf('/');
        String base = slash >= 0 ? normalized.substring(slash + 1) : normalized;
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

    private static void verifyStaged(StagedAsset asset) throws Exception {
        if (asset.sha256() == null || asset.sha256().isBlank()) {
            return;
        }
        String actual = sha256Hex(asset.path());
        if (!asset.sha256().equalsIgnoreCase(actual)) {
            throw new IllegalStateException("Update checksum mismatch (SHA-256)");
        }
    }

    private static String resolveExpectedSha256(JsonObject release, DesktopUpdatePlan.Item asset) {
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

    static String assetDigestSha256Public(JsonObject assetObj) {
        return assetDigestSha256(assetObj);
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

    private static String releaseNotes(JsonObject release) {
        if (release == null || !release.has("body") || release.get("body").isJsonNull()) {
            return "";
        }
        String body = release.get("body").getAsString();
        return body == null ? "" : body.trim();
    }

    private static String truncateNotes(String notes) {
        if (notes == null || notes.isBlank()) {
            return "";
        }
        if (notes.length() <= MAX_NOTES_CHARS) {
            return notes;
        }
        return notes.substring(0, MAX_NOTES_CHARS) + "…";
    }

    private static Path checkStatePath() {
        return DesktopPaths.userDataDir().resolve("updates").resolve("check-state.json");
    }

    private void persistCheckState(
            JsonObject release,
            JsonObject versionManifest,
            JsonObject status,
            long checkedAt
    ) {
        try {
            Path path = checkStatePath();
            Files.createDirectories(path.getParent());
            JsonObject root = new JsonObject();
            root.addProperty("lastNetworkCheckAt", checkedAt);
            root.addProperty("checkIntervalMs", CHECK_INTERVAL_MS);
            if (status != null) {
                root.add("status", status.deepCopy());
            }
            if (release != null) {
                root.add("release", release.deepCopy());
            }
            if (versionManifest != null) {
                root.add("versionManifest", versionManifest.deepCopy());
            }
            Files.writeString(path, root.toString(), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
        }
    }

    private void restoreCheckState() {
        Path path = checkStatePath();
        if (!Files.isRegularFile(path)) {
            return;
        }
        try {
            JsonObject root = JsonParser.parseReader(
                    Files.newBufferedReader(path, StandardCharsets.UTF_8)).getAsJsonObject();
            long checkedAt = root.has("lastNetworkCheckAt") && root.get("lastNetworkCheckAt").isJsonPrimitive()
                    ? root.get("lastNetworkCheckAt").getAsLong()
                    : 0L;
            if (checkedAt > 0L) {
                lastNetworkCheckAt.set(checkedAt);
            }
            JsonObject versionManifest = root.has("versionManifest") && root.get("versionManifest").isJsonObject()
                    ? root.getAsJsonObject("versionManifest")
                    : null;
            if (root.has("release") && root.get("release").isJsonObject()) {
                JsonObject release = root.getAsJsonObject("release");
                latestRelease.set(release);
                DesktopLocalVersion local = DesktopLocalVersion.readInstalled();
                String platform = platformKey();
                String tag = release.has("tag_name") ? release.get("tag_name").getAsString() : currentVersion;
                String latest = tag.startsWith("v") ? tag.substring(1) : tag;
                boolean hasUpdate = compareSemver(latest, currentVersion) > 0;
                // Prefer the persisted version manifest so restore does not fall back to
                // "download every incremental pack" when fingerprints are unavailable.
                DesktopUpdatePlan plan = hasUpdate
                        ? DesktopUpdatePlanner.plan(release, versionManifest, local, platform)
                        : DesktopUpdatePlan.none();
                if (hasUpdate && plan.isEmpty()) {
                    hasUpdate = false;
                }
                plannedUpdate.set(plan);
            }
            if (root.has("status") && root.get("status").isJsonObject()) {
                JsonObject status = root.getAsJsonObject("status").deepCopy();
                status.addProperty("cached", true);
                if (checkedAt > 0L) {
                    status.addProperty("checkedAt", checkedAt);
                    status.addProperty("nextCheckAt", checkedAt + CHECK_INTERVAL_MS);
                }
                status.addProperty("checkIntervalMs", CHECK_INTERVAL_MS);
                lastStatus.set(status);
            }
        } catch (Exception ignored) {
        }
    }

    @FunctionalInterface
    private interface ProgressCallback {
        void onProgress(long read, long contentLength);
    }

    private record StagedAsset(String kind, Path path, String sha256, long bytes) {
    }
}
