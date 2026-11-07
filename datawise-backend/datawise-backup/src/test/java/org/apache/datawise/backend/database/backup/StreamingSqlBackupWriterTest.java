package org.apache.datawise.backend.database.backup;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.dml.ConnectorDmlAccess;
import org.apache.datawise.backend.database.table.TableDataService;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StreamingSqlBackupWriterTest {

    @Test
    void writesDatabaseStreamWithTableSections() throws Exception {
        StreamingSqlBackupWriter writer = createWriter();
        ConnectionEntity entity = entity();

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        writer.writeDatabase(
                buffer,
                entity,
                "conn-1",
                "app",
                List.of("t"),
                true,
                "Local",
                "test",
                () -> false
        );

        String sql = buffer.toString(StandardCharsets.UTF_8);
        assertTrue(sql.contains("streaming_sql_v1"));
        assertTrue(sql.contains("CREATE TABLE t"));
        assertTrue(sql.contains("INSERT INTO t"));
    }

    @Test
    void writeTableReturnsRowCount() throws Exception {
        StreamingSqlBackupWriter writer = createWriter();
        ConnectionEntity entity = entity();

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        long rows = writer.writeTable(
                buffer,
                entity,
                "conn-1",
                "app",
                "t",
                true,
                "Local",
                "test",
                () -> false
        );

        assertEquals(1L, rows);
        String sql = buffer.toString(StandardCharsets.UTF_8);
        assertTrue(sql.contains("streaming_sql_v1_table"));
        assertTrue(sql.contains("-- table: t"));
        assertTrue(sql.contains("INSERT INTO t"));
    }

    @Test
    void sanitizeTableFileName() {
        assertEquals("orders", DatabaseBackupService.sanitizeTableFileName("orders"));
        assertEquals("a_b", DatabaseBackupService.sanitizeTableFileName("a/b"));
        assertEquals("table", DatabaseBackupService.sanitizeTableFileName("???"));
    }

    private static StreamingSqlBackupWriter createWriter() {
        TableDetailService tableDetailService = mock(TableDetailService.class);
        TableDataService tableDataService = mock(TableDataService.class);
        ConnectorFacade connectorFacade = mock(ConnectorFacade.class);
        ConnectorDmlAccess dml = mock(ConnectorDmlAccess.class);

        when(connectorFacade.dml()).thenReturn(dml);
        when(dml.buildDropTableIfExists(any(), any(), any())).thenReturn("DROP TABLE IF EXISTS t;\n");
        when(dml.buildInsertsFromTableData(any(), any(), any(), any())).thenReturn("INSERT INTO t VALUES (1);");
        when(tableDetailService.loadDdl(eq("t"), eq("conn-1"), eq("app")))
                .thenReturn(new TableDdlResult("CREATE TABLE t (id INT);"));
        when(tableDataService.fetch(eq("t"), eq("conn-1"), eq("app"), eq(0)))
                .thenReturn(new TableDataResult(
                        List.of(Map.of("name", "id")),
                        List.of(Map.of("id", 1)),
                        null,
                        false,
                        0,
                        1000
                ));

        return new StreamingSqlBackupWriter(tableDetailService, tableDataService, connectorFacade);
    }

    private static ConnectionEntity entity() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("sqlite");
        entity.setId("conn-1");
        entity.setName("Local");
        return entity;
    }
}
