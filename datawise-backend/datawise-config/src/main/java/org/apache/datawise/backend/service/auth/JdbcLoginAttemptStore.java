package org.apache.datawise.backend.service.auth;

import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** Shared JDBC login throttle store ({@code dw_login_attempt}). */
public class JdbcLoginAttemptStore implements LoginAttemptStore {

    private final JdbcTemplate jdbc;

    public JdbcLoginAttemptStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public AttemptWindow find(String usernameKey) {
        List<AttemptWindow> rows = jdbc.query(
                "SELECT failures, first_failure_at FROM dw_login_attempt WHERE username_key = ?",
                (rs, rowNum) -> new AttemptWindow(
                        rs.getInt("failures"),
                        rs.getTimestamp("first_failure_at").toInstant().toEpochMilli()),
                usernameKey);
        return rows.isEmpty() ? null : rows.get(0);
    }

    @Override
    public void save(String usernameKey, AttemptWindow window) {
        Timestamp first = Timestamp.from(Instant.ofEpochMilli(window.firstFailureAtMs()));
        Timestamp now = Timestamp.from(Instant.now());
        int updated = jdbc.update(
                """
                        UPDATE dw_login_attempt
                        SET failures = ?, first_failure_at = ?, updated_at = ?
                        WHERE username_key = ?
                        """,
                window.failures(), first, now, usernameKey);
        if (updated == 0) {
            jdbc.update(
                    """
                            INSERT INTO dw_login_attempt (username_key, failures, first_failure_at, updated_at)
                            VALUES (?, ?, ?, ?)
                            """,
                    usernameKey, window.failures(), first, now);
        }
    }

    @Override
    public void delete(String usernameKey) {
        jdbc.update("DELETE FROM dw_login_attempt WHERE username_key = ?", usernameKey);
    }
}
