package org.apache.datawise.desktop.prefs;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.datawise.desktop.DesktopPaths;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Persists main window bounds (window:getState / window:setState). */
public final class WindowStateStore {
    private static final String FILE = "window-state.json";
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private WindowStateStore() {
    }

    public static Path file() {
        return DesktopPaths.userDataDir().resolve(FILE);
    }

    public static JsonObject read() {
        Path path = file();
        if (!Files.isRegularFile(path)) {
            return defaultState();
        }
        try {
            return JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8)).getAsJsonObject();
        } catch (Exception e) {
            return defaultState();
        }
    }

    public static void write(JsonObject state) {
        try {
            Files.createDirectories(DesktopPaths.userDataDir());
            Files.writeString(file(), GSON.toJson(state), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
        }
    }

    public static JsonObject defaultState() {
        JsonObject state = new JsonObject();
        state.addProperty("width", 1440);
        state.addProperty("height", 900);
        state.addProperty("x", 80);
        state.addProperty("y", 60);
        state.addProperty("maximized", false);
        return state;
    }

    public static int intOr(JsonObject obj, String key, int fallback) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return fallback;
        }
        try {
            return obj.get(key).getAsInt();
        } catch (Exception e) {
            return fallback;
        }
    }

    public static boolean boolOr(JsonObject obj, String key, boolean fallback) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return fallback;
        }
        try {
            return obj.get(key).getAsBoolean();
        } catch (Exception e) {
            return fallback;
        }
    }
}
