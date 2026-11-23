package org.apache.datawise.desktop.updater;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.datawise.desktop.DesktopPaths;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Reads packaged {@code local_version.json} component fingerprints used to skip unchanged layers.
 */
public final class DesktopLocalVersion {
    private final String version;
    private final String platform;
    private final String frontendSha256;
    private final String serverJarSha256;
    private final String runtimeId;

    public DesktopLocalVersion(
            String version,
            String platform,
            String frontendSha256,
            String serverJarSha256,
            String runtimeId
    ) {
        this.version = version == null ? "" : version.trim();
        this.platform = platform == null ? "" : platform.trim();
        this.frontendSha256 = normalizeSha(frontendSha256);
        this.serverJarSha256 = normalizeSha(serverJarSha256);
        this.runtimeId = runtimeId == null ? "" : runtimeId.trim();
    }

    public static DesktopLocalVersion readInstalled() {
        for (Path candidate : DesktopUpdaterService.localVersionCandidates()) {
            DesktopLocalVersion parsed = read(candidate);
            if (parsed != null) {
                return parsed;
            }
        }
        return new DesktopLocalVersion(DesktopUpdaterService.resolveCurrentVersion(), "", null, null, null);
    }

    public static DesktopLocalVersion read(Path path) {
        if (path == null || !Files.isRegularFile(path)) {
            return null;
        }
        try {
            JsonObject obj = JsonParser.parseReader(
                    Files.newBufferedReader(path, StandardCharsets.UTF_8)).getAsJsonObject();
            String version = text(obj, "version");
            String platform = text(obj, "platform");
            String frontend = null;
            String server = null;
            String runtimeId = null;
            if (obj.has("components") && obj.get("components").isJsonObject()) {
                JsonObject components = obj.getAsJsonObject("components");
                frontend = componentSha(components, "frontend");
                server = componentSha(components, "serverJar");
                runtimeId = componentId(components, "runtime");
            }
            if (frontend == null || server == null) {
                if (obj.has("files") && obj.get("files").isJsonObject()) {
                    JsonObject files = obj.getAsJsonObject("files");
                    if (frontend == null) {
                        frontend = fileSha(files, "frontend-dist/index.html");
                    }
                    if (server == null) {
                        server = fileSha(files, "backend/datawise-server.jar");
                    }
                }
            }
            if (version == null || version.isBlank()) {
                return null;
            }
            return new DesktopLocalVersion(version, platform, frontend, server, runtimeId);
        } catch (Exception ignored) {
            return null;
        }
    }

    public static DesktopLocalVersion fromReleaseManifest(JsonObject manifest) {
        if (manifest == null) {
            return null;
        }
        String version = text(manifest, "version");
        String platform = text(manifest, "platform");
        String frontend = null;
        String server = null;
        String runtimeId = null;
        if (manifest.has("components") && manifest.get("components").isJsonObject()) {
            JsonObject components = manifest.getAsJsonObject("components");
            frontend = componentSha(components, "frontend");
            server = componentSha(components, "serverJar");
            runtimeId = componentId(components, "runtime");
        }
        return new DesktopLocalVersion(version, platform, frontend, server, runtimeId);
    }

    public String version() {
        return version;
    }

    public String platform() {
        return platform;
    }

    public String frontendSha256() {
        return frontendSha256;
    }

    public String serverJarSha256() {
        return serverJarSha256;
    }

    public String runtimeId() {
        return runtimeId;
    }

    public boolean hasFrontendFingerprint() {
        return frontendSha256 != null && !frontendSha256.isBlank();
    }

    public boolean hasServerJarFingerprint() {
        return serverJarSha256 != null && !serverJarSha256.isBlank();
    }

    public boolean hasRuntimeId() {
        return runtimeId != null && !runtimeId.isBlank();
    }

    /** Best-effort write after an incremental apply when the zip carried no full manifest. */
    public static void patchComponentSha(String componentKey, String sha256, long bytes) {
        String sha = normalizeSha(sha256);
        if (sha == null || componentKey == null || componentKey.isBlank()) {
            return;
        }
        for (Path candidate : DesktopUpdaterService.localVersionCandidates()) {
            if (!Files.isRegularFile(candidate)) {
                continue;
            }
            try {
                JsonObject obj = JsonParser.parseReader(
                        Files.newBufferedReader(candidate, StandardCharsets.UTF_8)).getAsJsonObject();
                JsonObject components = obj.has("components") && obj.get("components").isJsonObject()
                        ? obj.getAsJsonObject("components")
                        : new JsonObject();
                JsonObject entry = new JsonObject();
                entry.addProperty("sha256", sha);
                if (bytes > 0L) {
                    entry.addProperty("bytes", bytes);
                }
                components.add(componentKey, entry);
                obj.add("components", components);
                Files.writeString(candidate, obj.toString(), StandardCharsets.UTF_8);
            } catch (Exception ignored) {
            }
        }
        Path install = DesktopPaths.installRoot().resolve("local_version.json");
        try {
            if (Files.isRegularFile(install)) {
                JsonObject obj = JsonParser.parseReader(
                        Files.newBufferedReader(install, StandardCharsets.UTF_8)).getAsJsonObject();
                JsonObject components = obj.has("components") && obj.get("components").isJsonObject()
                        ? obj.getAsJsonObject("components")
                        : new JsonObject();
                JsonObject entry = new JsonObject();
                entry.addProperty("sha256", sha);
                if (bytes > 0L) {
                    entry.addProperty("bytes", bytes);
                }
                components.add(componentKey, entry);
                obj.add("components", components);
                Files.writeString(install, obj.toString(), StandardCharsets.UTF_8);
            }
        } catch (Exception ignored) {
        }
    }

    private static String componentSha(JsonObject components, String key) {
        if (!components.has(key) || !components.get(key).isJsonObject()) {
            return null;
        }
        return normalizeSha(text(components.getAsJsonObject(key), "sha256"));
    }

    private static String componentId(JsonObject components, String key) {
        if (!components.has(key) || !components.get(key).isJsonObject()) {
            return null;
        }
        String id = text(components.getAsJsonObject(key), "id");
        return id == null || id.isBlank() ? null : id.trim();
    }

    private static String fileSha(JsonObject files, String key) {
        if (!files.has(key) || !files.get(key).isJsonObject()) {
            return null;
        }
        return normalizeSha(text(files.getAsJsonObject(key), "sha256"));
    }

    private static String text(JsonObject obj, String key) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return null;
        }
        JsonElement el = obj.get(key);
        if (!el.isJsonPrimitive()) {
            return null;
        }
        String value = el.getAsString();
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String normalizeSha(String sha) {
        if (sha == null || sha.isBlank()) {
            return null;
        }
        String hex = sha.trim().toLowerCase(Locale.ROOT);
        return hex.matches("[a-f0-9]{64}") ? hex : null;
    }
}
