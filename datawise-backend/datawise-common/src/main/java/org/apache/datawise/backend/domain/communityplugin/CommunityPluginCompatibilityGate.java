package org.apache.datawise.backend.domain.communityplugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Install-time gates for {@code engines} and {@code permissions}.
 */
public final class CommunityPluginCompatibilityGate {

    /**
     * hostApi 1.2 adds {@code datawisePlugin.storage} and the opaque-origin workbench sandbox;
     * 1.3 adds optional manifest {@code localizations} for display copy;
     * 1.4 adds {@code host.embed} (relaxed workbench sandbox + {@code frame-src} for https embeds);
     * 1.5 adds {@code host.sql} ({@code datawisePlugin.sql}: list visible connections, read-only execute, open console);
     * 1.6 adds {@code host.ai} (status + chat via the current user's default LLM; API keys never leave the host);
     * 1.7 adds {@code datawisePlugin.shell.openExternal} / {@code host.openExternal} (http(s) via host shell).
     */
    public static final String HOST_API = "1.7";

    private static final Set<String> BASE_PERMISSIONS = Set.of(
            "host.workbench",
            "host.filesystem",
            "host.events",
            "host.binary",
            "host.clipboard",
            "host.embed",
            "host.sql",
            "host.ai");

    private static final Pattern NETWORK_PERMISSION = Pattern.compile(
            "^host\\.network:(https://[^\\s]+)$",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern GE_VERSION = Pattern.compile("^>=\\s*(\\d+(?:\\.\\d+){0,2})$");
    private static final Pattern CARET_VERSION = Pattern.compile("^\\^\\s*(\\d+(?:\\.\\d+){0,2})$");
    private static final Pattern EXACT_VERSION = Pattern.compile("^(\\d+(?:\\.\\d+){0,2})$");

    private CommunityPluginCompatibilityGate() {
    }

    public static void collectErrors(
                                     CommunityPluginManifest manifest,
                                     String appVersion,
                                     String hostApiVersion,
                                     List<String> errors,
                                     List<String> warnings) {
        if (manifest == null) {
            errors.add("manifest is required");
            return;
        }
        validatePermissions(manifest.permissions(), errors);
        CommunityPluginEngines engines = manifest.engines();
        if (engines == null) {
            warnings.add("manifest.engines is missing; host will assume current engines");
            return;
        }
        if (engines.datawise() != null && !engines.datawise().isBlank()) {
            if (!satisfies(engines.datawise(), appVersion)) {
                errors.add("engines.datawise " + engines.datawise() + " is not satisfied by app " + appVersion);
            }
        }
        if (engines.hostApi() != null && !engines.hostApi().isBlank()) {
            if (!satisfies(engines.hostApi(), hostApiVersion != null ? hostApiVersion : HOST_API)) {
                errors.add("engines.hostApi " + engines.hostApi() + " is not satisfied by hostApi " + hostApiVersion);
            }
        }
    }

    public static void validatePermissions(List<String> permissions, List<String> errors) {
        if (permissions == null || permissions.isEmpty()) {
            return;
        }
        int networkCount = 0;
        for (String raw : permissions) {
            if (raw == null || raw.isBlank()) {
                errors.add("permission entry must not be blank");
                continue;
            }
            String permission = raw.trim();
            if (BASE_PERMISSIONS.contains(permission)) {
                continue;
            }
            Matcher network = NETWORK_PERMISSION.matcher(permission);
            if (network.matches()) {
                networkCount++;
                if (networkCount > 8) {
                    errors.add("at most 8 host.network permissions are allowed");
                }
                String origin = network.group(1);
                if (!origin.toLowerCase(Locale.ROOT).startsWith("https://")) {
                    errors.add("host.network origins must use https: " + permission);
                }
                continue;
            }
            errors.add("unknown permission: " + permission);
        }
    }

    public static List<String> networkOrigins(List<String> permissions) {
        List<String> origins = new ArrayList<>();
        if (permissions == null) {
            return origins;
        }
        for (String raw : permissions) {
            if (raw == null) {
                continue;
            }
            Matcher network = NETWORK_PERMISSION.matcher(raw.trim());
            if (network.matches()) {
                origins.add(network.group(1));
            }
        }
        return origins;
    }

    /** Whether the plugin may embed third-party https pages in its workbench. */
    public static boolean allowsEmbed(List<String> permissions) {
        return permissions != null && permissions.contains("host.embed");
    }

    public static boolean satisfies(String requirement, String actual) {
        if (requirement == null || requirement.isBlank()) {
            return true;
        }
        if (actual == null || actual.isBlank()) {
            return false;
        }
        String req = requirement.trim();
        Matcher ge = GE_VERSION.matcher(req);
        if (ge.matches()) {
            return compareVersions(actual, ge.group(1)) >= 0;
        }
        Matcher caret = CARET_VERSION.matcher(req);
        if (caret.matches()) {
            int[] want = parseVersion(caret.group(1));
            int[] have = parseVersion(actual);
            return have[0] == want[0] && compareVersions(actual, caret.group(1)) >= 0;
        }
        Matcher exact = EXACT_VERSION.matcher(req);
        if (exact.matches()) {
            return compareVersions(actual, exact.group(1)) == 0;
        }
        return req.equalsIgnoreCase(actual.trim());
    }

    public static int compareVersions(String a, String b) {
        int[] pa = parseVersion(a);
        int[] pb = parseVersion(b);
        for (int i = 0; i < 3; i++) {
            if (pa[i] != pb[i]) {
                return Integer.compare(pa[i], pb[i]);
            }
        }
        return 0;
    }

    private static int[] parseVersion(String raw) {
        String cleaned = raw == null ? "0" : raw.trim();
        int dash = cleaned.indexOf('-');
        if (dash > 0) {
            cleaned = cleaned.substring(0, dash);
        }
        int plus = cleaned.indexOf('+');
        if (plus > 0) {
            cleaned = cleaned.substring(0, plus);
        }
        String[] parts = cleaned.split("\\.");
        int[] out = new int[3];
        for (int i = 0; i < 3; i++) {
            if (i < parts.length) {
                try {
                    out[i] = Integer.parseInt(parts[i].replaceAll("[^0-9].*$", ""));
                } catch (NumberFormatException e) {
                    out[i] = 0;
                }
            }
        }
        return out;
    }
}
