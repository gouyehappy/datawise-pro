package org.apache.datawise.backend.service.auth;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JdbcLoginAttemptStoreTest {

    private HikariDataSource dataSource;
    private LoginAttemptGuard guard;

    @BeforeEach
    void setUp() {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:mem:login_attempt_" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .baselineOnMigrate(true)
                .load()
                .migrate();
        guard = new LoginAttemptGuard(new JdbcLoginAttemptStore(new JdbcTemplate(dataSource)));
    }

    @AfterEach
    void tearDown() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void locksAcrossSharedStoreAfterMaxFailures() {
        for (int i = 0; i < LoginAttemptGuard.MAX_FAILURES; i++) {
            guard.recordFailure("Alice");
        }
        IllegalArgumentException locked = assertThrows(
                IllegalArgumentException.class,
                () -> guard.assertNotLocked("alice"));
        assertEquals(LoginAttemptGuard.LOGIN_LOCKED, locked.getMessage());

        // Second guard instance sharing the same JDBC table still sees the lock.
        LoginAttemptGuard other = new LoginAttemptGuard(new JdbcLoginAttemptStore(new JdbcTemplate(dataSource)));
        IllegalArgumentException stillLocked = assertThrows(
                IllegalArgumentException.class,
                () -> other.assertNotLocked("ALICE"));
        assertEquals(LoginAttemptGuard.LOGIN_LOCKED, stillLocked.getMessage());
    }

    @Test
    void clearFailuresRemovesSharedRow() {
        for (int i = 0; i < LoginAttemptGuard.MAX_FAILURES; i++) {
            guard.recordFailure("bob");
        }
        guard.clearFailures("bob");
        guard.assertNotLocked("bob");
    }
}
