package org.apache.datawise.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Headless API token bound to a registered user. Stored in {@code config/api-tokens.json}. */
public class ApiTokenEntity {

    private String id;
    private String name;
    private Long userId;
    /** 创建时绑定的租户；缺失时按 default。 */
    private String tenantId;
    private String tokenHash;
    private String tokenLookup;
    private List<String> scopes = new ArrayList<>();
    private Instant createdAt;
    private Instant lastUsedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

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

    public String getTokenHash() {
        return tokenHash;
    }

    public void setTokenHash(String tokenHash) {
        this.tokenHash = tokenHash;
    }

    public String getTokenLookup() {
        return tokenLookup;
    }

    public void setTokenLookup(String tokenLookup) {
        this.tokenLookup = tokenLookup;
    }

    public List<String> getScopes() {
        return scopes;
    }

    public void setScopes(List<String> scopes) {
        this.scopes = scopes != null ? scopes : new ArrayList<>();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }

    public void setLastUsedAt(Instant lastUsedAt) {
        this.lastUsedAt = lastUsedAt;
    }
}
