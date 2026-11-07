package org.apache.datawise.desktop;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public final class DesktopRuntimePorts {
    private static final JsonObject ROOT = load();

    private DesktopRuntimePorts() {
    }

    private static JsonObject load() {
        try (InputStream in = DesktopRuntimePorts.class.getResourceAsStream("/runtime-ports.json")) {
            if (in == null) {
                return defaultPorts();
            }
            return JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
        } catch (Exception e) {
            return defaultPorts();
        }
    }

    private static JsonObject defaultPorts() {
        JsonObject root = new JsonObject();
        JsonObject dev = new JsonObject();
        dev.addProperty("backend", 18421);
        dev.addProperty("frontend", 28413);
        root.add("dev", dev);
        JsonObject desktop = new JsonObject();
        desktop.addProperty("backend", 18423);
        desktop.addProperty("frontend", 28423);
        root.add("desktop", desktop);
        return root;
    }

    public static int devBackend() {
        return ROOT.getAsJsonObject("dev").get("backend").getAsInt();
    }

    public static int devFrontend() {
        return ROOT.getAsJsonObject("dev").get("frontend").getAsInt();
    }

    public static int desktopBackend() {
        return ROOT.getAsJsonObject("desktop").get("backend").getAsInt();
    }

    /** Stable origin for packaged renderer so Chromium localStorage survives restarts. */
    public static int desktopFrontend() {
        JsonObject desktop = ROOT.getAsJsonObject("desktop");
        if (desktop != null && desktop.has("frontend")) {
            return desktop.get("frontend").getAsInt();
        }
        return 28423;
    }
}
