package org.apache.datawise.desktop.prefs;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.datawise.desktop.DesktopPaths;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class DesktopPreferencesStore {
    private static final String FILE_NAME = "desktop-preferences.json";
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    public static final int MAX_RECENT = 8;

    private DesktopPreferencesStore() {
    }

    public static Path preferencesFile() {
        return DesktopPaths.userDataDir().resolve(FILE_NAME);
    }

    public static JsonObject read() {
        Path path = preferencesFile();
        if (!Files.isRegularFile(path)) {
            return new JsonObject();
        }
        try {
            String raw = Files.readString(path, StandardCharsets.UTF_8);
            return JsonParser.parseString(raw).getAsJsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    public static void write(JsonObject patch) {
        JsonObject next = read();
        for (String key : patch.keySet()) {
            if ("jre".equals(key) && patch.get(key) != null && patch.get(key).isJsonObject()) {
                JsonObject jre = next.has("jre") && next.get("jre").isJsonObject()
                        ? next.getAsJsonObject("jre")
                        : new JsonObject();
                JsonObject patchJre = patch.getAsJsonObject("jre");
                for (String jk : patchJre.keySet()) {
                    jre.add(jk, patchJre.get(jk));
                }
                next.add("jre", jre);
            } else if ("runtimeSetupPending".equals(key)
                    && patch.get(key) != null
                    && patch.get(key).isJsonPrimitive()
                    && !patch.get(key).getAsBoolean()) {
                next.remove("runtimeSetupPending");
            } else {
                next.add(key, patch.get(key));
            }
        }
        if (next.has("configDir") && (next.get("configDir").isJsonNull()
                || next.get("configDir").getAsString().isBlank())) {
            next.remove("configDir");
        }
        try {
            Files.createDirectories(DesktopPaths.userDataDir());
            Files.writeString(preferencesFile(), GSON.toJson(next), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write desktop preferences", e);
        }
    }

    public static boolean runtimeSetupPending() {
        JsonObject prefs = read();
        return prefs.has("runtimeSetupPending")
                && prefs.get("runtimeSetupPending").isJsonPrimitive()
                && prefs.get("runtimeSetupPending").getAsBoolean();
    }

    public static void setRuntimeSetupPending(boolean pending) {
        JsonObject patch = new JsonObject();
        patch.addProperty("runtimeSetupPending", pending);
        write(patch);
    }

    public static String jreSourceOrNull() {
        JsonObject prefs = read();
        if (!prefs.has("jre") || !prefs.get("jre").isJsonObject()) {
            return null;
        }
        JsonObject jre = prefs.getAsJsonObject("jre");
        if (!jre.has("source") || jre.get("source").isJsonNull()) {
            return null;
        }
        return jre.get("source").getAsString();
    }

    public static String jreCustomHomeOrNull() {
        JsonObject prefs = read();
        if (!prefs.has("jre") || !prefs.get("jre").isJsonObject()) {
            return null;
        }
        JsonObject jre = prefs.getAsJsonObject("jre");
        if (!jre.has("customHome") || jre.get("customHome").isJsonNull()) {
            return null;
        }
        String value = jre.get("customHome").getAsString();
        return value == null || value.isBlank() ? null : value.trim();
    }

    public static void setJre(String source, String customHome) {
        JsonObject jre = new JsonObject();
        if (source != null && !source.isBlank()) {
            jre.addProperty("source", source.trim());
        }
        if (customHome == null || customHome.isBlank()) {
            jre.add("customHome", null);
        } else {
            jre.addProperty("customHome", customHome.trim());
        }
        JsonObject patch = new JsonObject();
        patch.add("jre", jre);
        write(patch);
    }

    public static String configDirOrNull() {
        JsonObject prefs = read();
        if (!prefs.has("configDir") || prefs.get("configDir").isJsonNull()) {
            return null;
        }
        String value = prefs.get("configDir").getAsString().trim();
        return value.isEmpty() ? null : value;
    }

    public static List<String> recentWorkspaces() {
        JsonObject prefs = read();
        List<String> out = new ArrayList<>();
        if (!prefs.has("recentWorkspaces") || !prefs.get("recentWorkspaces").isJsonArray()) {
            return out;
        }
        prefs.getAsJsonArray("recentWorkspaces").forEach(el -> {
            if (el != null && el.isJsonPrimitive()) {
                String path = el.getAsString().trim();
                if (!path.isEmpty()) {
                    out.add(Path.of(path).normalize().toString());
                }
            }
        });
        return out;
    }

    public static List<String> touchRecent(String resolvedPath) {
        String key = Path.of(resolvedPath.trim()).normalize().toString();
        if (key.isBlank()) {
            return recentWorkspaces();
        }
        Set<String> ordered = new LinkedHashSet<>();
        ordered.add(key);
        for (String item : recentWorkspaces()) {
            ordered.add(Path.of(item).normalize().toString());
        }
        List<String> next = ordered.stream().limit(MAX_RECENT).toList();
        JsonObject patch = new JsonObject();
        patch.add("recentWorkspaces", GSON.toJsonTree(next));
        write(patch);
        return next;
    }

    public static List<String> removeRecent(String resolvedPath) {
        String key = Path.of(resolvedPath.trim()).normalize().toString();
        List<String> next = recentWorkspaces().stream()
                .filter(item -> !Path.of(item).normalize().toString().equals(key))
                .toList();
        JsonObject patch = new JsonObject();
        patch.add("recentWorkspaces", GSON.toJsonTree(next));
        write(patch);
        return next;
    }
}
