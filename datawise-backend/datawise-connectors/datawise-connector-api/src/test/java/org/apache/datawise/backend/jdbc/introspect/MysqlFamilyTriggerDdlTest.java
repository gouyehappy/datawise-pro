package org.apache.datawise.backend.jdbc.introspect;

import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MysqlFamilyTriggerDdlTest {

    @Test
    void loadTriggerDdlReadsSqlOriginalStatement() throws Exception {
        MysqlFamilyTableIntrospector introspector = new MysqlFamilyTableIntrospector(
                MysqlFamilyIntrospectOptions.mysql()
        ) {
            @Override
            public boolean supports(String dbType) {
                return true;
            }
        };

        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(anyString())).thenReturn(rs);
        when(rs.next()).thenReturn(true);
        when(rs.getString("SQL Original Statement")).thenReturn(
                "CREATE TRIGGER trg BEFORE INSERT ON t FOR EACH ROW BEGIN END"
        );

        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("mysql");
        entity.setDatabaseName("shop");

        TableDdlResult result = introspector.loadTriggerDdl(connection, entity, "shop", "trg");
        assertEquals(
                "CREATE TRIGGER trg BEFORE INSERT ON t FOR EACH ROW BEGIN END",
                result.ddl()
        );
    }

    @Test
    void loadFunctionDdlReadsCreateFunctionColumn() throws Exception {
        MysqlFamilyTableIntrospector introspector = new MysqlFamilyTableIntrospector(
                MysqlFamilyIntrospectOptions.mysql()
        ) {
            @Override
            public boolean supports(String dbType) {
                return true;
            }
        };

        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(anyString())).thenReturn(rs);
        when(rs.next()).thenReturn(true);
        when(rs.getString("Create Function")).thenReturn("CREATE FUNCTION f() RETURNS INT RETURN 1");

        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("mysql");
        entity.setDatabaseName("shop");

        TableDdlResult result = introspector.loadFunctionDdl(connection, entity, "shop", "f");
        assertEquals("CREATE FUNCTION f() RETURNS INT RETURN 1", result.ddl());
    }
}
