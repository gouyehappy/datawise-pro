package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.domain.DataTypeOptionsResult;
import org.apache.datawise.backend.domain.EngineOptionsResult;
import org.junit.jupiter.api.Test;

import java.sql.ResultSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DialectOptionsSupportTest {

    @Test
    void supportsLiveEnginesForMysqlFamilyOnly() {
        assertTrue(DialectOptionsSupport.supportsLiveEngines("mysql"));
        assertTrue(DialectOptionsSupport.supportsLiveEngines("mariadb"));
        assertFalse(DialectOptionsSupport.supportsLiveEngines("postgresql"));
        assertFalse(DialectOptionsSupport.supportsLiveEngines("redis"));
    }

    @Test
    void listDataTypesRoutesByDialect() {
        List<DataTypeOptionsResult.DataTypeOption> mysql = DialectOptionsSupport.listDataTypes("mysql");
        assertTrue(mysql.stream().anyMatch(t -> "VARCHAR".equals(t.name())));
        assertTrue(mysql.stream().anyMatch(t -> "JSON".equals(t.name())));

        List<DataTypeOptionsResult.DataTypeOption> pg = DialectOptionsSupport.listDataTypes("postgresql");
        assertTrue(pg.stream().anyMatch(t -> "jsonb".equals(t.name())));
        assertTrue(pg.stream().anyMatch(t -> "uuid".equals(t.name())));

        assertTrue(DialectOptionsSupport.listDataTypes("redis").isEmpty());
    }

    @Test
    void parseMysqlEnginesReadsShowEnginesRows() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.next()).thenReturn(true, true, false);
        when(rs.getString("Engine")).thenReturn("InnoDB", "MEMORY");
        when(rs.getString("Support")).thenReturn("DEFAULT", "YES");
        when(rs.getString("Comment")).thenReturn("Supports transactions", "Hash based");
        when(rs.getString("Transactions")).thenReturn("YES", "NO");
        when(rs.getString("XA")).thenReturn("YES", "NO");
        when(rs.getString("Savepoints")).thenReturn("YES", "NO");

        List<EngineOptionsResult.EngineOption> engines = DialectOptionsSupport.parseMysqlEngines(rs);
        assertEquals(2, engines.size());
        assertEquals("InnoDB", engines.get(0).name());
        assertEquals("DEFAULT", engines.get(0).support());
        assertTrue(engines.get(0).transactions());
        assertFalse(engines.get(1).transactions());
    }
}
