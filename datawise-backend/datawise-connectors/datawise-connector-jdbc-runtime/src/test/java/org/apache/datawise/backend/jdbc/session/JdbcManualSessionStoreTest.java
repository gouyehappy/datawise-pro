package org.apache.datawise.backend.jdbc.session;

import org.apache.datawise.backend.domain.SqlSessionStatus;
import org.junit.jupiter.api.Test;

import java.sql.Connection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcManualSessionStoreTest {

    @Test
    void key_composesUserAndSessionKey() {
        assertEquals("42:tab-1", JdbcManualSessionStore.key(42L, "tab-1"));
    }

    @Test
    void getStatus_returnsIdleWhenMissing() {
        JdbcManualSessionStore store = new JdbcManualSessionStore();
        SqlSessionStatus status = store.getStatus(1L, "missing");
        assertNull(status.connectionId());
        assertNull(status.database());
    }

    @Test
    void requireManualSession_returnsNullForAutocommitSession() {
        JdbcManualSessionStore store = new JdbcManualSessionStore();
        JdbcManualSessionStore.ManagedSession session = store.getOrCreate(1L, "tab-1", "conn-1", "shop");
        assertNull(store.requireManualSession(1L, "tab-1"));
        session.autocommit = false;
        assertEquals(session, store.requireManualSession(1L, "tab-1"));
    }

    @Test
    void invalidateConnection_closesAndClearsSessionReference() throws Exception {
        JdbcManualSessionStore store = new JdbcManualSessionStore();
        JdbcManualSessionStore.ManagedSession session = store.getOrCreate(1L, "tab-a", "conn-1", "shop");
        Connection connection = mock(Connection.class);
        session.connection = connection;

        store.invalidateConnection("1:tab-a");

        verify(connection).close();
        assertNull(session.connection);
    }

    @Test
    void evictIdleSessions_closesStaleConnection() throws Exception {
        JdbcManualSessionStore store = new JdbcManualSessionStore();
        JdbcManualSessionStore.ManagedSession session = store.getOrCreate(1L, "tab-a", "conn-1", "shop");
        Connection connection = mock(Connection.class);
        session.connection = connection;
        session.lastAccessedAtMs = 1L;

        store.evictIdleSessions(System.currentTimeMillis());

        verify(connection).close();
        assertNull(store.get(1L, "tab-a"));
    }

    @Test
    void evictIdleSessions_closesOpenTransactionSession() throws Exception {
        JdbcManualSessionStore store = new JdbcManualSessionStore();
        JdbcManualSessionStore.ManagedSession session = store.getOrCreate(1L, "tab-tx", "conn-1", "shop");
        Connection connection = mock(Connection.class);
        when(connection.getAutoCommit()).thenReturn(false);
        session.connection = connection;
        session.autocommit = false;
        session.pending = true;
        session.lastAccessedAtMs = 1L;

        store.evictIdleSessions(System.currentTimeMillis());

        verify(connection).rollback();
        verify(connection).close();
        assertNull(store.get(1L, "tab-tx"));
    }

    @Test
    void getOrCreate_returnsSameInstanceForSameKey() {
        JdbcManualSessionStore store = new JdbcManualSessionStore();
        JdbcManualSessionStore.ManagedSession first = store.getOrCreate(1L, "tab-1", "conn-1", "shop");
        JdbcManualSessionStore.ManagedSession second = store.getOrCreate(1L, "tab-1", "conn-2", "other");
        assertEquals(first, second);
    }
}
