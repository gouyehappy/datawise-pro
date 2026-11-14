package org.apache.datawise.backend.configstore.jdbc;

import org.apache.datawise.backend.configstore.AuthSessionPolicyService;
import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.SessionEntity;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcSessionStore implements SessionStore {

    private final JdbcTemplate jdbc;
    private final AuthSessionPolicyService sessionPolicy;

    private final RowMapper<SessionEntity> mapper = (rs, rowNum) -> {
        SessionEntity session = new SessionEntity();
        session.setId(rs.getString("id"));
        session.setUserId(rs.getLong("user_id"));
        session.setGuest(rs.getBoolean("guest"));
        session.setTenantId(rs.getString("tenant_id"));
        Timestamp expires = rs.getTimestamp("expires_at");
        Timestamp created = rs.getTimestamp("created_at");
        if (expires != null) {
            session.setExpiresAt(expires.toInstant());
        }
        if (created != null) {
            session.setCreatedAt(created.toInstant());
        }
        return session;
    };

    public JdbcSessionStore(
                            @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
                            AuthSessionPolicyService sessionPolicy) {
        this.jdbc = jdbc;
        this.sessionPolicy = sessionPolicy;
        purgeExpired();
    }

    @Override
    public Optional<SessionEntity> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        List<SessionEntity> rows = jdbc.query("SELECT * FROM dw_sessions WHERE id = ?", mapper, id.trim());
        return rows.stream().findFirst();
    }

    @Override
    public Optional<SessionEntity> authenticate(String id) {
        Optional<SessionEntity> found = findById(id);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        SessionEntity session = found.get();
        if (!isActive(session)) {
            deleteById(id);
            return Optional.empty();
        }
        if (sessionPolicy.shouldRenewNow(session.getExpiresAt())) {
            return Optional.of(renew(session));
        }
        return Optional.of(session);
    }

    @Override
    public SessionEntity save(SessionEntity session) {
        if (session.getTenantId() == null || session.getTenantId().isBlank()) {
            session.setTenantId(TenantIds.DEFAULT);
        }
        int updated = jdbc.update(
                """
                        UPDATE dw_sessions SET user_id=?, guest=?, tenant_id=?, expires_at=?, created_at=?
                        WHERE id=?
                        """,
                session.getUserId(),
                session.isGuest(),
                session.getTenantId(),
                toTimestamp(session.getExpiresAt()),
                toTimestamp(session.getCreatedAt()),
                session.getId());
        if (updated == 0) {
            jdbc.update(
                    """
                            INSERT INTO dw_sessions (id, user_id, guest, tenant_id, expires_at, created_at)
                            VALUES (?,?,?,?,?,?)
                            """,
                    session.getId(),
                    session.getUserId(),
                    session.isGuest(),
                    session.getTenantId(),
                    toTimestamp(session.getExpiresAt()),
                    toTimestamp(session.getCreatedAt()));
        }
        return session;
    }

    @Override
    public SessionEntity create(SessionEntity session) {
        Instant now = Instant.now();
        if (session.getCreatedAt() == null) {
            session.setCreatedAt(now);
        }
        session.setExpiresAt(now.plus(sessionPolicy.ttlMinutes(), ChronoUnit.MINUTES));
        return save(session);
    }

    @Override
    public SessionEntity renew(SessionEntity session) {
        session.setExpiresAt(Instant.now().plus(sessionPolicy.ttlMinutes(), ChronoUnit.MINUTES));
        return save(session);
    }

    @Override
    public void deleteById(String id) {
        if (id == null || id.isBlank()) {
            return;
        }
        jdbc.update("DELETE FROM dw_sessions WHERE id = ?", id.trim());
    }

    @Override
    public void deleteByUserId(long userId) {
        jdbc.update("DELETE FROM dw_sessions WHERE user_id = ?", userId);
    }

    @Override
    public void purgeExpired() {
        jdbc.update("DELETE FROM dw_sessions WHERE expires_at IS NOT NULL AND expires_at <= ?", Timestamp.from(Instant.now()));
    }

    private boolean isActive(SessionEntity session) {
        Instant expiresAt = session.getExpiresAt();
        return expiresAt == null || expiresAt.isAfter(Instant.now());
    }

    private static Timestamp toTimestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}
