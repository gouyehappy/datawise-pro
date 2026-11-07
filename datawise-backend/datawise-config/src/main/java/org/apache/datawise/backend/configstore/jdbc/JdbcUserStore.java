package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.model.UserEntity;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcUserStore implements UserStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public JdbcUserStore(
                         @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
                         ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    private RowMapper<UserEntity> mapper() {
        return (rs, rowNum) -> {
            UserEntity user = new UserEntity();
            user.setId(rs.getLong("id"));
            user.setUsername(rs.getString("username"));
            user.setPasswordHash(rs.getString("password_hash"));
            user.setDisplayName(rs.getString("display_name"));
            user.setEmail(rs.getString("email"));
            user.setGuest(rs.getBoolean("guest"));
            user.setFeaturePermissions(MetadataJsonSupport.readMap(objectMapper, rs.getString("feature_permissions")));
            Timestamp created = rs.getTimestamp("created_at");
            Timestamp updated = rs.getTimestamp("updated_at");
            if (created != null) {
                user.setCreatedAt(created.toInstant());
            }
            if (updated != null) {
                user.setUpdatedAt(updated.toInstant());
            }
            return user;
        };
    }

    @Override
    public Optional<UserEntity> findById(Long id) {
        if (id == null) {
            return Optional.empty();
        }
        List<UserEntity> rows = jdbc.query("SELECT * FROM dw_users WHERE id = ?", mapper(), id);
        return rows.stream().findFirst();
    }

    @Override
    public synchronized UserEntity saveUser(UserEntity user) {
        Objects.requireNonNull(user.getId(), "id is required");
        Instant now = Instant.now();
        if (user.getCreatedAt() == null) {
            user.setCreatedAt(now);
        }
        user.setUpdatedAt(now);
        int updated = jdbc.update(
                """
                        UPDATE dw_users SET username=?, password_hash=?, display_name=?, email=?, guest=?,
                        feature_permissions=?, created_at=?, updated_at=? WHERE id=?
                        """,
                user.getUsername(),
                user.getPasswordHash(),
                user.getDisplayName(),
                user.getEmail(),
                user.isGuest(),
                MetadataJsonSupport.writeMap(objectMapper, user.getFeaturePermissions()),
                toTimestamp(user.getCreatedAt()),
                toTimestamp(user.getUpdatedAt()),
                user.getId());
        if (updated == 0) {
            jdbc.update(
                    """
                            INSERT INTO dw_users (id, username, password_hash, display_name, email, guest,
                            feature_permissions, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
                            """,
                    user.getId(),
                    user.getUsername(),
                    user.getPasswordHash(),
                    user.getDisplayName(),
                    user.getEmail(),
                    user.isGuest(),
                    MetadataJsonSupport.writeMap(objectMapper, user.getFeaturePermissions()),
                    toTimestamp(user.getCreatedAt()),
                    toTimestamp(user.getUpdatedAt()));
        }
        return user;
    }

    @Override
    public Optional<UserEntity> findByUsername(String username) {
        if (username == null || username.isBlank()) {
            return Optional.empty();
        }
        List<UserEntity> rows = jdbc.query(
                "SELECT * FROM dw_users WHERE LOWER(username) = LOWER(?)",
                mapper(),
                username.trim());
        return rows.stream().findFirst();
    }

    @Override
    public List<UserEntity> listRegisteredUsers() {
        return jdbc.query("SELECT * FROM dw_users WHERE guest = FALSE ORDER BY id", mapper());
    }

    @Override
    public List<UserEntity> listAllUsers() {
        return jdbc.query("SELECT * FROM dw_users ORDER BY id", mapper());
    }

    private static Timestamp toTimestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}
