package org.apache.datawise.backend.server.web;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

/**
 * WebSocket 终端 IP 白名单：{@code allowedIps} 为空时不限制；非空时仅允许列表内 IP/CIDR。
 */
public final class TerminalIpWhitelistSupport {

    private TerminalIpWhitelistSupport() {
    }

    public static boolean isAllowed(String clientIp, List<String> allowedIps) {
        if (allowedIps == null || allowedIps.isEmpty()) {
            return true;
        }
        String normalized = TerminalClientIpSupport.normalizeHost(clientIp);
        if (normalized == null || normalized.isBlank()) {
            return false;
        }
        for (String entry : allowedIps) {
            if (entry == null || entry.isBlank()) {
                continue;
            }
            String pattern = entry.trim();
            if (matchesPattern(normalized, pattern)) {
                return true;
            }
        }
        return false;
    }

    private static boolean matchesPattern(String clientIp, String pattern) {
        if (pattern.contains("/")) {
            return matchesCidr(clientIp, pattern);
        }
        return clientIp.equalsIgnoreCase(TerminalClientIpSupport.normalizeHost(pattern));
    }

    private static boolean matchesCidr(String clientIp, String cidr) {
        String[] parts = cidr.split("/", 2);
        if (parts.length != 2) {
            return false;
        }
        try {
            InetAddress client = InetAddress.getByName(clientIp);
            InetAddress network = InetAddress.getByName(parts[0].trim());
            int prefix = Integer.parseInt(parts[1].trim());
            byte[] clientBytes = client.getAddress();
            byte[] networkBytes = network.getAddress();
            if (clientBytes.length != networkBytes.length) {
                return false;
            }
            int maxPrefix = clientBytes.length * 8;
            if (prefix < 0 || prefix > maxPrefix) {
                return false;
            }
            int fullBytes = prefix / 8;
            int remainingBits = prefix % 8;
            for (int i = 0; i < fullBytes; i++) {
                if (clientBytes[i] != networkBytes[i]) {
                    return false;
                }
            }
            if (remainingBits == 0) {
                return true;
            }
            int mask = 0xFF << (8 - remainingBits);
            return (clientBytes[fullBytes] & mask) == (networkBytes[fullBytes] & mask);
        } catch (UnknownHostException | NumberFormatException ex) {
            return false;
        }
    }
}
