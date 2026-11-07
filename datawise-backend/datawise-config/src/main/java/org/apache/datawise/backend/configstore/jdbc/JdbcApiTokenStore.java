package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ApiTokenStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ApiTokenEntity;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcApiTokenStore implements ApiTokenStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public JdbcApiTokenStore(
                             @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
                             ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    private RowMapper<ApiTokenEntity> mapper() {
        return (rs, rowNum) -> {
            ApiTokenEntity token = new ApiTokenEntity();
            token.setId(rs.getString("id"));
            token.setName(rs.getString("name"));
            token.setUserId(rs.getLong("user_id"));
            token.setTenantId(rs.getString("tenant_id"));
            token.setTokenHash(rs.getString("token_hash"));
            token.setTokenLookup(rs.getString("token_lookup"));
            token.setScopes(MetadataJsonSupport.readStringList(objectMapper, rs.getString("scopes")));
            Timestamp created = rs.getTimestamp("created_at");
            Timestamp lastUsed = rs.getTimestamp("last_used_at");
            if (created != null) {
                token.setCreatedAt(created.toInstant());
            }
            if (lastUsed != null) {
                token.setLastUsedAt(lastUsed.toInstant());
            }
            return token;
        };
    }

    @Override
    public List<ApiTokenEntity> listAll() {
        return jdbc.query("SELECT * FROM dw_api_tokens ORDER BY created_at DESC", mapper());
    }

    @Override
    public Optional<ApiTokenEntity> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        List<ApiTokenEntity> rows = jdbc.query("SELECT * FROM dw_api_tokens WHERE id = ?", mapper(), id.trim());
        return rows.stream().findFirst();
    }

    @Override
    public Optional<ApiTokenEntity> findByTokenLookup(String tokenLookup) {
        if (tokenLookup == null || tokenLookup.isBlank()) {
            return Optional.empty();
        }
        List<ApiTokenEntity> rows = jdbc.query(
                "SELECT * FROM dw_api_tokens WHERE token_lookup = ?",
                mapper(),
                tokenLookup.trim());
        return rows.stream().findFirst();
    }

    @Override
    public ApiTokenEntity save(ApiTokenEntity token) {
        if (token.getTenantId() == null || token.getTenantId().isBlank()) {
            token.setTenantId(TenantIds.normalizeOrDefault(UserContext.getTenantId()));
        }
        int updated = jdbc.update(
                """
                        UPDATE dw_api_tokens SET name=?, user_id=?, tenant_id=?, token_hash=?, token_lookup=?,
                        scopes=?, created_at=?, last_used_at=? WHERE id=?
                        """,
                token.getName(),
                token.getUserId(),
                token.getTenantId(),
                token.getTokenHash(),
                token.getTokenLookup(),
                MetadataJsonSupport.writeStringList(objectMapper, token.getScopes()),
                toTimestamp(token.getCreatedAt()),
                toTimestamp(token.getLastUsedAt()),
                token.getId());
        if (updated == 0) {
            jdbc.update(
                    """
                            INSERT INTO dw_api_tokens (id, name, user_id, tenant_id, token_hash, token_lookup,
                            scopes, created_at, last_used_at) VALUES (?,?,?,?,?,?,?,?,?)
                            """,
                    token.getId(),
                    token.getName(),
                    token.getUserId(),
                    token.getTenantId(),
                    token.getTokenHash(),
                    token.getTokenLookup(),
                    MetadataJsonSupport.writeStringList(objectMapper, token.getScopes()),
                    toTimestamp(token.getCreatedAt() != null ? token.getCreatedAt() : Instant.now()),
                    toTimestamp(token.getLastUsedAt()));
        }
        return token;
    }

    private static Timestamp toTimestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}
