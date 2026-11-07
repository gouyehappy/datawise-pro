package org.apache.datawise.desktop.prefs;

import com.google.gson.JsonObject;

/**
 * Desktop preference: open http(s) popups in the OS browser instead of a CEF window.
 * Synced from the Vue settings page via {@code shell:setOpenHttpLinksIn}.
 */
public final class DesktopOpenLinksPrefs {
    private static final String KEY = "openHttpLinksIn";
    private static final String SYSTEM = "system";

    private static volatile boolean useSystemBrowser;

    static {
        refreshFromStore();
    }

    private DesktopOpenLinksPrefs() {
    }

    public static boolean useSystemBrowser() {
        return useSystemBrowser;
    }

    public static void setUseSystemBrowser(boolean system) {
        useSystemBrowser = system;
        JsonObject patch = new JsonObject();
        patch.addProperty(KEY, system ? SYSTEM : "builtin");
        DesktopPreferencesStore.write(patch);
    }

    public static void setFromClientValue(String raw) {
        setUseSystemBrowser(SYSTEM.equalsIgnoreCase(raw == null ? "" : raw.trim()));
    }

    public static void refreshFromStore() {
        JsonObject prefs = DesktopPreferencesStore.read();
        if (prefs.has(KEY) && prefs.get(KEY).isJsonPrimitive()) {
            useSystemBrowser = SYSTEM.equalsIgnoreCase(prefs.get(KEY).getAsString());
        } else {
            useSystemBrowser = false;
        }
    }
}
