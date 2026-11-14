package org.apache.datawise.backend.connector.sqlserver.support;

import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.jdbc.support.JdbcConnectionScopeGuard;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.withSettings;
import static org.mockito.Mockito.when;

class SqlServerModuleDdlTest {

    @Test
    void loadProcedureDdlReadsSqlModulesDefinition() throws Exception {
        SqlServerTableIntrospector introspector = new SqlServerTableIntrospector();
        Connection connection = mock(
                Connection.class,
                withSettings().extraInterfaces(JdbcConnectionScopeGuard.ScopedConnection.class)
        );
        Statement statement = mock(Statement.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet dbNameRs = mock(ResultSet.class);
        ResultSet moduleRs = mock(ResultSet.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(anyString())).thenReturn(dbNameRs);
        when(dbNameRs.next()).thenReturn(true);
        when(dbNameRs.getString(1)).thenReturn("master");
        when(connection.prepareStatement(contains("sys.sql_modules"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(moduleRs);
        when(moduleRs.next()).thenReturn(true);
        when(moduleRs.getString(1)).thenReturn("CREATE PROCEDURE dbo.p1 AS BEGIN SELECT 1 END");

        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("sqlserver");
        entity.setDatabaseName("shop");

        TableDdlResult result = introspector.loadProcedureDdl(connection, entity, "shop.dbo", "p1");
        assertEquals("CREATE PROCEDURE dbo.p1 AS BEGIN SELECT 1 END", result.ddl());
    }

    @Test
    void loadSequenceDdlReadsSysSequences() throws Exception {
        SqlServerTableIntrospector introspector = new SqlServerTableIntrospector();
        Connection connection = mock(
                Connection.class,
                withSettings().extraInterfaces(JdbcConnectionScopeGuard.ScopedConnection.class)
        );
        Statement statement = mock(Statement.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet dbNameRs = mock(ResultSet.class);
        ResultSet seqRs = mock(ResultSet.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(anyString())).thenReturn(dbNameRs);
        when(dbNameRs.next()).thenReturn(true);
        when(dbNameRs.getString(1)).thenReturn("master");
        when(connection.prepareStatement(contains("sys.sequences"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(seqRs);
        when(seqRs.next()).thenReturn(true);
        when(seqRs.getString("ddl_text")).thenReturn(
                "CREATE SEQUENCE [dbo].[order_seq] AS bigint START WITH 1 INCREMENT BY 1"
                        + " MINVALUE 1 MAXVALUE 999 CACHE 0 NO CYCLE"
        );

        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("sqlserver");
        entity.setDatabaseName("shop");

        TableDdlResult result = introspector.loadSequenceDdl(connection, entity, "shop.dbo", "order_seq");
        assertEquals(
                "CREATE SEQUENCE [dbo].[order_seq] AS bigint START WITH 1 INCREMENT BY 1"
                        + " MINVALUE 1 MAXVALUE 999 CACHE 0 NO CYCLE",
                result.ddl()
        );
    }
}
