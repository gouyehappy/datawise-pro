package org.apache.datawise.backend.connector.postgresql.support;

import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;
import org.apache.datawise.backend.connector.postgresql.schema.PostgresqlSchemaDialect;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PostgresqlSequenceDdlTest {

    @Test
    void loadSequenceDdlReadsPgSequenceCatalog() throws Exception {
        PostgresqlTableIntrospector introspector = new PostgresqlTableIntrospector(
                new PostgresqlSchemaDialect(),
                new PostgresqlDdlRenderer()
        );
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true);
        when(rs.getString(1)).thenReturn(
                "CREATE SEQUENCE public.order_seq AS bigint INCREMENT BY 1 MINVALUE 1"
                        + " MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE"
        );

        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("postgresql");

        TableDdlResult result = introspector.loadSequenceDdl(connection, entity, "public", "order_seq");
        assertEquals(
                "CREATE SEQUENCE public.order_seq AS bigint INCREMENT BY 1 MINVALUE 1"
                        + " MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE",
                result.ddl()
        );
    }
}
