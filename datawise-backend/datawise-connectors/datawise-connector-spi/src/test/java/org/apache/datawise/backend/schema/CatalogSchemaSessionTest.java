package org.apache.datawise.backend.schema;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CatalogSchemaSessionTest {

    @Test
    void applySwitchesCatalogAndSchema() throws SQLException {
        Connection connection = mock(Connection.class);
        CatalogSchemaScope scope = new CatalogSchemaScope("mydb", "dbo");

        CatalogSchemaSession.apply(connection, scope, Connection::setCatalog);

        verify(connection).setCatalog("mydb");
        verify(connection).setSchema("dbo");
    }

    @Test
    void isAppliedMatchesCatalogAndSchema() throws SQLException {
        Connection connection = mock(Connection.class);
        when(connection.getCatalog()).thenReturn("mydb");
        when(connection.getSchema()).thenReturn("dbo");

        assertTrue(CatalogSchemaSession.isApplied(connection, new CatalogSchemaScope("mydb", "dbo")));
        assertFalse(CatalogSchemaSession.isApplied(connection, new CatalogSchemaScope("other", "dbo")));
    }

    @Test
    void isAppliedIgnoresCatalogAndSchemaCase() throws SQLException {
        Connection connection = mock(Connection.class);
        when(connection.getCatalog()).thenReturn("MyDB");
        when(connection.getSchema()).thenReturn("DBO");

        assertTrue(CatalogSchemaSession.isApplied(connection, new CatalogSchemaScope("mydb", "dbo")));
    }
}
