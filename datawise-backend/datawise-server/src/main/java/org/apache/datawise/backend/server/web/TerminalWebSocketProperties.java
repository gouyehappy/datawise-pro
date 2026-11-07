package org.apache.datawise.backend.server.web;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "datawise.terminal.websocket")
public class TerminalWebSocketProperties {

    private boolean enabled = false;
    private String path = "/ws/terminal";
    /**
     * 为空：不限制来源 IP；非空：仅允许列表内 IP 或 IPv4 CIDR（如 {@code 10.0.0.0/8}）。
     */
    private List<String> allowedIps = new ArrayList<>();
    /**
     * 非空时：仅当直连 {@code remoteAddr} 命中列表才读取 {@code X-Forwarded-For} / {@code X-Real-IP}。
     */
    private List<String> trustedProxyIps = new ArrayList<>();

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public List<String> getAllowedIps() {
        return allowedIps;
    }

    public void setAllowedIps(List<String> allowedIps) {
        this.allowedIps = allowedIps != null ? new ArrayList<>(allowedIps) : new ArrayList<>();
    }

    public List<String> getTrustedProxyIps() {
        return trustedProxyIps;
    }

    public void setTrustedProxyIps(List<String> trustedProxyIps) {
        this.trustedProxyIps = trustedProxyIps != null ? new ArrayList<>(trustedProxyIps) : new ArrayList<>();
    }
}
