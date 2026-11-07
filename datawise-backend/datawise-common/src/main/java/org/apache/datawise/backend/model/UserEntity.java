package org.apache.datawise.backend.model;

import java.time.Instant;
import java.util.Map;

public class UserEntity {

    private Long id;

    private String username;

    private String passwordHash;

    private String displayName;

    private String email;

    private boolean guest = false;

    /** 功能权限覆盖；null 表示使用默认策略（注册用户全量，访客工作台）。 */
    private Map<String, Boolean> featurePermissions;

    private Instant createdAt;

    private Instant updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public boolean isGuest() {
        return guest;
    }

    public void setGuest(boolean guest) {
        this.guest = guest;
    }

    public Map<String, Boolean> getFeaturePermissions() {
        return featurePermissions;
    }

    public void setFeaturePermissions(Map<String, Boolean> featurePermissions) {
        this.featurePermissions = featurePermissions;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
