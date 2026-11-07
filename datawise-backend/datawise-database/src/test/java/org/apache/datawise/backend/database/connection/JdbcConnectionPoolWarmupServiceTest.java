package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.jdbc.support.JdbcDriverConnectionFactory;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JdbcConnectionPoolWarmupServiceTest {

    @Mock
    private JdbcDriverConnectionFactory connectionFactory;
    @Mock
    private Connection connection;

    private JdbcConnectionPoolWarmupService service;

    @BeforeEach
    void setUp() {
        JdbcPoolProperties properties = new JdbcPoolProperties();
        properties.setMinimumIdle(2);
        service = new JdbcConnectionPoolWarmupService(connectionFactory, properties);
    }

    @AfterEach
    void tearDown() {
        service.shutdown();
    }

    @Test
    void warmup_skipsNonJdbcDataSources() throws SQLException {
        ConnectionEntity entity = entity("conn-redis", "redis");

        JdbcConnectionPoolWarmupService.WarmupResult result = service.warmup(entity);

        assertTrue(result.skipped());
        verify(connectionFactory, never()).open(entity);
    }

    @Test
    void usesJdbcPool_falseForSshAndOtherNonJdbcCatalogTypes() {
        assertFalse(JdbcConnectionPoolWarmupService.usesJdbcPool(entity("conn-ssh", "ssh")));
        assertFalse(JdbcConnectionPoolWarmupService.usesJdbcPool(entity("conn-kafka", "kafka")));
        assertFalse(JdbcConnectionPoolWarmupService.usesJdbcPool(entity("conn-yarn", "yarn")));
        assertTrue(JdbcConnectionPoolWarmupService.usesJdbcPool(entity("conn-mysql", "mysql")));
    }

    @Test
    void warmupForConnect_skipsSshWithoutOpeningJdbc() throws SQLException {
        ConnectionEntity entity = entity("conn-ssh", "ssh");

        JdbcConnectionPoolWarmupService.WarmupResult result = service.warmupForConnect(entity);

        assertTrue(result.skipped());
        verify(connectionFactory, never()).open(entity);
    }

    @Test
    void warmup_borrowsUpToMinimumIdle() throws SQLException {
        ConnectionEntity entity = entity("conn-mysql", "mysql");
        when(connectionFactory.open(entity)).thenReturn(connection);
        when(connection.isValid(3)).thenReturn(true);

        JdbcConnectionPoolWarmupService.WarmupResult result = service.warmup(entity);

        assertEquals(2, result.warmed());
        assertEquals(2, result.target());
        verify(connectionFactory, times(2)).open(entity);
        verify(connection, times(2)).close();
    }

    @Test
    void warmupInBackground_borrowsUpToMinimumIdleAsync() throws SQLException {
        ConnectionEntity entity = entity("conn-mysql", "mysql");
        when(connectionFactory.open(entity)).thenReturn(connection);
        when(connection.isValid(3)).thenReturn(true);

        service.warmupInBackground(entity);

        verify(connectionFactory, timeout(1_000).times(2)).open(entity);
        verify(connection, timeout(1_000).times(2)).close();
    }

    @Test
    void warmupForConnect_returnsAfterFirstBorrowAndCompletesRemainingInBackground() throws Exception {
        ConnectionEntity entity = entity("conn-mysql", "mysql");
        CountDownLatch secondBorrowStarted = new CountDownLatch(1);
        CountDownLatch releaseSecondBorrow = new CountDownLatch(1);
        AtomicInteger opens = new AtomicInteger();
        when(connectionFactory.open(entity)).thenAnswer(invocation -> {
            int call = opens.incrementAndGet();
            if (call == 2) {
                secondBorrowStarted.countDown();
                if (!releaseSecondBorrow.await(1, TimeUnit.SECONDS)) {
                    throw new SQLException("timed out waiting for test release");
                }
            }
            return connection;
        });
        when(connection.isValid(3)).thenReturn(true);

        try {
            long startedAt = System.nanoTime();
            JdbcConnectionPoolWarmupService.WarmupResult result = service.warmupForConnect(entity);
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);

            assertEquals(1, result.warmed());
            assertEquals(2, result.target());
            assertTrue(elapsedMs < 500, "connect warmup should not wait for background pool fill");
            assertTrue(secondBorrowStarted.await(1, TimeUnit.SECONDS));
        } finally {
            releaseSecondBorrow.countDown();
        }

        verify(connectionFactory, timeout(1_000).times(2)).open(entity);
        verify(connection, timeout(1_000).times(2)).close();
    }

    private static ConnectionEntity entity(String id, String dbType) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setDbType(dbType);
        return entity;
    }
}
