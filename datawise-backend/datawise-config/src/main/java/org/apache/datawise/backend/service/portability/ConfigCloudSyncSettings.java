package org.apache.datawise.backend.service.portability;

/** Persisted WebDAV endpoints for config cloud sync (password may be encrypted at rest). */
public class ConfigCloudSyncSettings {

    private String baseUrl = "";
    private String username = "";
    /** Plain on write from client; encrypted when stored; never returned as plaintext. */
    private String password = "";
    private boolean hasPassword;
    private String remotePath = "datawise/profile-sync.dwprofile";

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl != null ? baseUrl : "";
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username != null ? username : "";
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password != null ? password : "";
    }

    public boolean isHasPassword() {
        return hasPassword;
    }

    public void setHasPassword(boolean hasPassword) {
        this.hasPassword = hasPassword;
    }

    public String getRemotePath() {
        return remotePath;
    }

    public void setRemotePath(String remotePath) {
        this.remotePath = remotePath != null && !remotePath.isBlank()
                ? remotePath
                : "datawise/profile-sync.dwprofile";
    }
}
