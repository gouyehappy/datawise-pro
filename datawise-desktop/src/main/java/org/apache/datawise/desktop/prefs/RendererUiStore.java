package org.apache.datawise.desktop.prefs;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.datawise.desktop.DesktopPaths;
import org.apache.datawise.desktop.ui.SplashTheme;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Host-side persistence for renderer UI keys that must survive Chromium origin changes
 * (e.g. packaged static-server port). Synced into {@code localStorage} on bridge inject.
 */
public final class RendererUiStore {
    private static final String FILE = "renderer-ui.json";
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private RendererUiStore() {
    }

    public static Path file() {
        return DesktopPaths.userDataDir().resolve(FILE);
    }

    public static JsonObject read() {
        Path path = file();
        if (!Files.isRegularFile(path)) {
            return new JsonObject();
        }
        try {
            return JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8)).getAsJsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    public static void write(JsonObject patch) {
        JsonObject next = read();
        // Guest fallback must not erase a remembered account login. Explicit sign-out
        // clears these keys first, so a later guest write still persists.
        boolean keepRegisteredLogin = isRegisteredSession(next) && isGuestSessionPatch(patch);
        if (patch != null) {
            for (String key : patch.keySet()) {
                if (keepRegisteredLogin && isSessionKey(key)) {
                    continue;
                }
                if (patch.get(key) == null || patch.get(key).isJsonNull()) {
                    next.remove(key);
                } else {
                    next.add(key, patch.get(key));
                }
            }
        }
        try {
            Files.createDirectories(DesktopPaths.userDataDir());
            Files.writeString(file(), GSON.toJson(next), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
        }
    }

    public static void clearSessionKeys() {
        JsonObject next = read();
        next.remove("sessionId");
        next.remove("userName");
        next.remove("userId");
        next.remove("guest");
        next.remove("expiresAt");
        try {
            Files.createDirectories(DesktopPaths.userDataDir());
            Files.writeString(file(), GSON.toJson(next), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
        }
    }

    /** JS snippet that restores keys into localStorage before Vue boots. */
    public static String localStorageBootstrapJs() {
        JsonObject data = read();
        StringBuilder js = new StringBuilder();
        js.append("(function(){try{");
        // Same-origin reload already has the latest login in localStorage. Do not
        // replace that account with a stale guest record from the host file.
        js.append("var __dwSid=localStorage.getItem('dw-cli-session-id');");
        js.append("var __dwGuest=localStorage.getItem('dw-cli-is-guest');");
        js.append("var __dwKeepUser=__dwSid&&__dwSid.indexOf('session-')===0&&__dwGuest==='0'&&");
        js.append(jsonQuote(str(data, "guest") == null ? "" : str(data, "guest")));
        js.append("==='1';");
        js.append("if(!__dwKeepUser){");
        putLs(js, "dw-cli-session-id", str(data, "sessionId"));
        putLs(js, "dw-cli-username", str(data, "userName"));
        putLs(js, "dw-cli-user-id", str(data, "userId"));
        putLs(js, "dw-cli-is-guest", str(data, "guest"));
        putLs(js, "dw-cli-session-expires-at", str(data, "expiresAt"));
        js.append("}");
        putLs(js, "dw-cli-onboarding-completed", str(data, "onboardingCompleted"));
        putLs(js, "dw-cli-onboarding-first-insight-completed", str(data, "onboardingFirstInsightCompleted"));
        putLs(js, "dw-cli-runtime-setup-completed", str(data, "runtimeSetupCompleted"));
        js.append(SplashTheme.themePrefsBootstrapJs());
        js.append("}catch(e){}})();");
        return js.toString();
    }

    private static boolean isSessionKey(String key) {
        return "sessionId".equals(key)
                || "userName".equals(key)
                || "userId".equals(key)
                || "guest".equals(key)
                || "expiresAt".equals(key);
    }

    private static boolean isRegisteredSession(JsonObject data) {
        String sessionId = str(data, "sessionId");
        return "0".equals(str(data, "guest"))
                && sessionId != null
                && sessionId.startsWith("session-");
    }

    private static boolean isGuestSessionPatch(JsonObject patch) {
        return patch != null && patch.has("guest") && "1".equals(str(patch, "guest"));
    }

    private static String str(JsonObject data, String key) {
        if (data == null || !data.has(key) || data.get(key).isJsonNull()) {
            return null;
        }
        try {
            return data.get(key).getAsString();
        } catch (Exception e) {
            return null;
        }
    }

    private static void putLs(StringBuilder js, String key, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        js.append("localStorage.setItem(")
                .append(jsonQuote(key))
                .append(",")
                .append(jsonQuote(value))
                .append(");");
    }

    private static String jsonQuote(String value) {
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "")
                .replace("\n", "\\n")
                + "\"";
    }

    /** JS string literal for injected bootstrap snippets. */
    public static String jsString(String value) {
        return jsonQuote(value);
    }
}
