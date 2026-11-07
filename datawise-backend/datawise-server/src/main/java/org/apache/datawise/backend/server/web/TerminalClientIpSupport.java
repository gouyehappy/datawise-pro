package org.apache.datawise.backend.server.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServletServerHttpRequest;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.List;

/**
 * 从 HTTP / WebSocket 握手请求解析客户端 IP。
 * 仅当直连 {@code remoteAddr} 命中 {@code trustedProxyIps} 时才读取 {@code X-Forwarded-For} / {@code X-Real-IP}。
 */
public final class TerminalClientIpSupport {

    public static final String ERROR_CODE_FORBIDDEN = "FORBIDDEN";

    private TerminalClientIpSupport() {
    }

    public static String resolveClientIp(ServerHttpRequest request, List<String> trustedProxyIps) {
        if (request instanceof ServletServerHttpRequest servletRequest) {
            return resolveClientIp(servletRequest.getServletRequest(), trustedProxyIps);
        }
        InetSocketAddress remote = request.getRemoteAddress();
        if (remote == null) {
            return null;
        }
        InetAddress address = remote.getAddress();
        return address != null ? normalizeHost(address.getHostAddress()) : remote.getHostString();
    }

    public static String resolveClientIp(HttpServletRequest request, List<String> trustedProxyIps) {
        String remoteAddr = normalizeHost(request.getRemoteAddr());
        if (!shouldTrustForwardedHeaders(remoteAddr, trustedProxyIps)) {
            return remoteAddr;
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return normalizeHost(forwarded.split(",")[0].trim());
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return normalizeHost(realIp.trim());
        }
        return remoteAddr;
    }

    static boolean shouldTrustForwardedHeaders(String remoteAddr, List<String> trustedProxyIps) {
        if (trustedProxyIps == null || trustedProxyIps.isEmpty()) {
            return false;
        }
        return TerminalIpWhitelistSupport.isAllowed(remoteAddr, trustedProxyIps);
    }

    static String normalizeHost(String host) {
        if (host == null || host.isBlank()) {
            return null;
        }
        String trimmed = host.trim();
        if (trimmed.startsWith("::ffff:")) {
            return trimmed.substring("::ffff:".length());
        }
        if ("0:0:0:0:0:0:0:1".equals(trimmed) || "::1".equals(trimmed)) {
            return "::1";
        }
        return trimmed;
    }
}
