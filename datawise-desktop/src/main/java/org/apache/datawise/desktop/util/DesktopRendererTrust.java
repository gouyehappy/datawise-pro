package org.apache.datawise.desktop.util;

import java.net.URI;
import java.util.Locale;

/**
 * Origin allowlist for the desktop renderer and CEF bridge.
 * Only loopback http(s) SPA origins are trusted.
 */
public final class DesktopRendererTrust {
    private DesktopRendererTrust() {
    }

    /**
     * True when {@code url} is {@code http(s)://} to {@code 127.0.0.1} or {@code localhost}
     * (any port / path / query).
     */
    public static boolean isTrustedRendererUrl(String url) {
        if (url == null || url.isBlank()) {
            return false;
        }
        try {
            URI uri = URI.create(url.trim());
            String scheme = uri.getScheme();
            if (scheme == null) {
                return false;
            }
            scheme = scheme.toLowerCase(Locale.ROOT);
            if (!"http".equals(scheme) && !"https".equals(scheme)) {
                return false;
            }
            String host = uri.getHost();
            if (host == null || host.isBlank()) {
                return false;
            }
            host = host.toLowerCase(Locale.ROOT);
            return "127.0.0.1".equals(host) || "localhost".equals(host);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Validates {@code DATAWISE_RENDERER_URL} overrides. Returns the trimmed URL when trusted,
     * otherwise {@code null} (caller should fall back to the default loopback SPA).
     */
    public static String sanitizeRendererUrlOverride(String override) {
        if (override == null || override.isBlank()) {
            return null;
        }
        String trimmed = override.trim();
        if (!isTrustedRendererUrl(trimmed)) {
            System.err.println("[datawise-desktop] rejecting untrusted DATAWISE_RENDERER_URL (loopback http(s) only)");
            return null;
        }
        return trimmed;
    }
}
