package org.apache.datawise.desktop.prefs;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Workspace {@code config/runtime.json} — JRE prefs and first-run setup marker.
 * Takes precedence over global desktop-preferences for JRE when present.
 */
public final class RuntimeJsonStore {
    private static final String FILE_NAME = "runtime.json";
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private RuntimeJsonStore() {
    }

    public static Path file(Path configDir) {
        return configDir.resolve(FILE_NAME);
    }

    public static JsonObject read(Path configDir) {
        Path path = file(configDir);
        if (!Files.isRegularFile(path)) {
            return new JsonObject();
        }
        try {
            return JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8)).getAsJsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    public static void write(Path configDir, JsonObject patch) {
        JsonObject next = read(configDir);
        if (patch != null) {
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
                } else {
                    next.add(key, patch.get(key));
                }
            }
        }
        try {
            Files.createDirectories(configDir);
            Files.writeString(file(configDir), GSON.toJson(next), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write runtime.json", e);
        }
    }

    public static void markSetupPending(Path configDir) {
        JsonObject patch = new JsonObject();
        patch.addProperty("setupPending", true);
        write(configDir, patch);
    }

    public static void clearSetupPending(Path configDir) {
        JsonObject patch = new JsonObject();
        patch.addProperty("setupPending", false);
        write(configDir, patch);
    }

    public static boolean isSetupPending(Path configDir) {
        JsonObject raw = read(configDir);
        return raw.has("setupPending") && raw.get("setupPending").getAsBoolean();
    }

    public static String jreSource(Path configDir) {
        JsonObject jre = jreObject(configDir);
        if (jre == null || !jre.has("source") || jre.get("source").isJsonNull()) {
            return null;
        }
        return jre.get("source").getAsString();
    }

    public static String jreCustomHome(Path configDir) {
        JsonObject jre = jreObject(configDir);
        if (jre == null || !jre.has("customHome") || jre.get("customHome").isJsonNull()) {
            return null;
        }
        String value = jre.get("customHome").getAsString();
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static JsonObject jreObject(Path configDir) {
        JsonObject raw = read(configDir);
        if (!raw.has("jre") || !raw.get("jre").isJsonObject()) {
            return null;
        }
        return raw.getAsJsonObject("jre");
    }
}
