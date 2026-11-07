package org.apache.datawise.backend.server.web;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "datawise.ssh.terminal.websocket")
public class SshTerminalWebSocketProperties {

    private boolean enabled = true;
    private String path = "/ws/ssh-shell";
    private List<String> allowedIps = new ArrayList<>();
    private List<String> trustedProxyIps = new ArrayList<>();
    /**
     * After an unexpected WebSocket drop, keep the SSH shell this many milliseconds
     * so the client can reattach with the same sessionId. Zero disables resume.
     */
    private int resumeGraceMs = 15_000;

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

    public int getResumeGraceMs() {
        return resumeGraceMs;
    }

    public void setResumeGraceMs(int resumeGraceMs) {
        this.resumeGraceMs = Math.max(0, resumeGraceMs);
    }
}
