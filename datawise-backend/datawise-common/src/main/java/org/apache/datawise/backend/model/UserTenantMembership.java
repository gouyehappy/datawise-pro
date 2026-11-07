package org.apache.datawise.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class UserTenantMembership {

    private Long userId;

    private String tenantId;

    private List<String> roleIds = new ArrayList<>();

    /** active / invited / disabled */
    private String status = "active";

    private Instant joinedAt;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public List<String> getRoleIds() {
        return roleIds;
    }

    public void setRoleIds(List<String> roleIds) {
        this.roleIds = roleIds != null ? roleIds : new ArrayList<>();
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

    public void setJoinedAt(Instant joinedAt) {
        this.joinedAt = joinedAt;
    }
}
