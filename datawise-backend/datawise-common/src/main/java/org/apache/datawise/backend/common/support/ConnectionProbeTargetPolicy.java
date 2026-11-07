package org.apache.datawise.backend.common.support;

import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * Guards ad-hoc connection probes (e.g. {@code POST /api/connections/test}) from targeting
 * private or link-local networks.
 */
public final class ConnectionProbeTargetPolicy {

    private ConnectionProbeTargetPolicy() {
    }

    public static void requireAllowedProbeHost(String host, String label) {
        requireAllowedProbeHost(host, label, false);
    }

    public static void requireAllowedProbeHost(String host, String label, boolean allowPrivateNetworks) {
        if (allowPrivateNetworks) {
            if (host == null || host.isBlank()) {
                throw new IllegalArgumentException(label + " is required");
            }
            return;
        }
        String trimmed = host.trim();
        if (isLocalhost(trimmed)) {
            return;
        }
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        try {
            InetAddress address = InetAddress.getByName(trimmed);
            if (address.isAnyLocalAddress() || address.isLoopbackAddress()) {
                return;
            }
            if (address.isLinkLocalAddress() || address.isSiteLocalAddress() || address.isMulticastAddress()) {
                throw new IllegalArgumentException(
                        label + " must not target private or link-local addresses: " + host.trim());
            }
        } catch (UnknownHostException ex) {
            if (looksLikePrivateLiteral(trimmed)) {
                throw new IllegalArgumentException(
                        label + " must not target private or link-local addresses: " + host.trim());
            }
        }
    }

    private static boolean isLocalhost(String host) {
        return "localhost".equalsIgnoreCase(host);
    }

    private static boolean looksLikePrivateLiteral(String host) {
        if (host.startsWith("10.")
                || host.startsWith("192.168.")
                || host.startsWith("169.254.")
                || host.startsWith("127.")) {
            return true;
        }
        if (host.startsWith("172.")) {
            String[] parts = host.split("\\.");
            if (parts.length >= 2) {
                try {
                    int second = Integer.parseInt(parts[1]);
                    return second >= 16 && second <= 31;
                } catch (NumberFormatException ignored) {
                    return false;
                }
            }
        }
        return false;
    }
}
