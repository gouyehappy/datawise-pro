package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.common.SqlConcurrencyLimitException;
import org.apache.datawise.backend.config.DatawiseQueryProperties;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlQueryAdmissionServiceTest {

    @Test
    void unlimitedAllowsManyLeases() {
        SqlQueryAdmissionService service = service(0, 0);
        try (var a = service.acquire(1L);
             var b = service.acquire(1L);
             var c = service.acquire(2L)) {
            assertEquals(0, service.globalInFlight());
            assertEquals(0, service.userInFlight(1L));
        }
    }

    @Test
    void perUserLimitRejectsOverflow() {
        SqlQueryAdmissionService service = service(0, 1);
        try (var first = service.acquire(9L)) {
            assertEquals(1, service.userInFlight(9L));
            SqlConcurrencyLimitException ex = assertThrows(
                    SqlConcurrencyLimitException.class,
                    () -> service.acquire(9L)
            );
            assertTrue(ex.getMessage().contains("limit"));
            assertEquals(1, service.userInFlight(9L));
        }
        assertEquals(0, service.userInFlight(9L));
        assertEquals(0, service.trackedUserCount());
    }

    @Test
    void globalLimitRejectsOverflowAcrossUsers() {
        SqlQueryAdmissionService service = service(1, 0);
        try (var first = service.acquire(1L)) {
            assertEquals(1, service.globalInFlight());
            assertThrows(SqlConcurrencyLimitException.class, () -> service.acquire(2L));
            assertEquals(1, service.globalInFlight());
        }
        assertEquals(0, service.globalInFlight());
    }

    @Test
    void failedGlobalAcquireReleasesUserSlot() {
        SqlQueryAdmissionService service = service(1, 2);
        try (var first = service.acquire(1L)) {
            assertThrows(SqlConcurrencyLimitException.class, () -> service.acquire(2L));
            assertEquals(1, service.userInFlight(1L));
            assertEquals(0, service.userInFlight(2L));
            assertEquals(1, service.globalInFlight());
        }
        assertEquals(0, service.globalInFlight());
        assertEquals(0, service.userInFlight(1L));
        assertEquals(0, service.trackedUserCount());
    }

    private static SqlQueryAdmissionService service(int global, int perUser) {
        DatawiseQueryProperties properties = new DatawiseQueryProperties();
        properties.setMaxConcurrentGlobal(global);
        properties.setMaxConcurrentPerUser(perUser);
        return new SqlQueryAdmissionService(properties);
    }
}
