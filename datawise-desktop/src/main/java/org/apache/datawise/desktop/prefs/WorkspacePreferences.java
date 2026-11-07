package org.apache.datawise.desktop.prefs;

import com.google.gson.JsonObject;
import org.apache.datawise.desktop.DesktopPaths;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class WorkspacePreferences {
    private WorkspacePreferences() {
    }

    public static String sanitizeFolderName(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.matches(".*[<>:\"|?*\\x00/\\\\].*") || ".".equals(trimmed) || "..".equals(trimmed)) {
            return null;
        }
        return trimmed;
    }

    public static boolean hasConfig(Path dir) {
        return Files.isRegularFile(dir.resolve("users.json"))
                || Files.isRegularFile(dir.resolve("connections.xml"))
                || Files.isRegularFile(dir.resolve("sessions.json"))
                || Files.isRegularFile(dir.resolve("tenants").resolve("index.json"))
                || Files.isRegularFile(dir.resolve("tenants").resolve("default").resolve("connections.xml"));
    }

    public static Path resolveNewWorkspaceParent() {
        Path parent = DesktopPaths.documentsWorkspacesParent();
        try {
            Files.createDirectories(parent);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot create workspace parent: " + parent, e);
        }
        return parent;
    }

    public static JsonObject prepareNewWorkspace(String name) {
        String safe = sanitizeFolderName(name);
        JsonObject result = new JsonObject();
        if (safe == null) {
            result.addProperty("ok", false);
            result.addProperty("error", "invalid");
            return result;
        }
        Path target = resolveNewWorkspaceParent().resolve(safe);
        if (Files.exists(target) && hasConfig(target)) {
            result.addProperty("ok", false);
            result.addProperty("error", "exists");
            return result;
        }
        try {
            Files.createDirectories(target);
        } catch (Exception e) {
            result.addProperty("ok", false);
            result.addProperty("error", "invalid");
            return result;
        }
        result.addProperty("ok", true);
        result.addProperty("path", target.normalize().toString());
        return result;
    }

    public static List<JsonObject> buildWorkspaceList(String activePath, String defaultPath) {
        String activeNorm = Path.of(activePath).normalize().toString();
        String defaultNorm = Path.of(defaultPath).normalize().toString();
        Set<String> ordered = new LinkedHashSet<>();
        if (!activeNorm.isBlank()) {
            ordered.add(activeNorm);
        }
        for (String item : DesktopPreferencesStore.recentWorkspaces()) {
            ordered.add(Path.of(item).normalize().toString());
        }
        if (!defaultNorm.isBlank()) {
            ordered.add(defaultNorm);
        }
        List<JsonObject> out = new ArrayList<>();
        for (String path : ordered) {
            JsonObject entry = new JsonObject();
            entry.addProperty("path", path);
            entry.addProperty("active", path.equals(activeNorm));
            entry.addProperty("isDefault", path.equals(defaultNorm));
            out.add(entry);
        }
        return out;
    }
}
