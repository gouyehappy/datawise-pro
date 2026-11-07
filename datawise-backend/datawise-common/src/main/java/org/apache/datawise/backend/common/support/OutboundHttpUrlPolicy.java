package org.apache.datawise.backend.common.support;

import java.net.URI;
import java.util.Locale;

/**
 * SSRF guard for admin-configured outbound HTTP targets (webhooks, ticket APIs).
 * Loopback is allowed (local confirmations / desktop); private networks follow
 * {@link ConnectionProbeTargetPolicy}.
 */
public final class OutboundHttpUrlPolicy {

    private OutboundHttpUrlPolicy() {
    }

    public static void requireAllowedOutboundUrl(String rawUrl, boolean allowPrivateNetworks) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new IllegalArgumentException("url is required");
        }
        String trimmed = rawUrl.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.startsWith("mailto:") || looksLikeBareEmail(trimmed)) {
            return;
        }
        URI uri;
        try {
            uri = URI.create(trimmed);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("invalid url: " + trimmed, ex);
        }
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new IllegalArgumentException("url must be http(s) or mailto: " + trimmed);
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("url host is required: " + trimmed);
        }
        ConnectionProbeTargetPolicy.requireAllowedProbeHost(host, "Webhook URL host", allowPrivateNetworks);
    }

    private static boolean looksLikeBareEmail(String value) {
        int at = value.indexOf('@');
        return at > 0 && at < value.length() - 1 && !value.contains("://") && !value.contains("/");
    }
}
