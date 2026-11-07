package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.jdbc.connection.JdbcConnectionAccessor;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

@ExtendWith(MockitoExtension.class)
class JdbcTableDataReaderTest {

    @Mock
    private JdbcConnectionAccessor connectionAccessor;

    private JdbcTableDataReader reader;

    @BeforeEach
    void setUp() {
        reader = new JdbcTableDataReader(connectionAccessor, null, null, 0, 100_000);
    }

    @Test
    void buildTableSelectSql_mysqlWithDatabase_qualifiesTable() {
        ConnectionEntity entity = entity("mysql");
        String sql = reader.buildTableSelectSql(entity, "orders", "shop");
        assertEquals("SELECT * FROM `shop`.`orders`", sql);
    }

    @Test
    void buildTableSelectSql_postgresqlWithDatabase_qualifiesTable() {
        ConnectionEntity entity = entity("postgresql");
        String sql = reader.buildTableSelectSql(entity, "orders", "public");
        assertEquals("SELECT * FROM \"public\".\"orders\"", sql);
    }

    @Test
    void buildTableSelectSql_trinoWithCatalogSchema_qualifiesTable() {
        ConnectionEntity entity = entity("trino");
        String sql = reader.buildTableSelectSql(entity, "agent_test3", "hive.a003");
        assertEquals("SELECT * FROM \"hive\".\"a003\".\"agent_test3\"", sql);
    }

    @Test
    void buildTableSelectSql_hiveWithCatalogSchema_qualifiesTable() {
        ConnectionEntity entity = entity("hive");
        String sql = reader.buildTableSelectSql(entity, "users", "default.main");
        assertEquals("SELECT * FROM `default`.`main`.`users`", sql);
    }

    @Test
    void buildTableSelectSql_oracleWithSchema_qualifiesTable() {
        ConnectionEntity entity = entity("oracle");
        String sql = reader.buildTableSelectSql(entity, "HIVE_1114", "DBSDBA");
        assertEquals("SELECT * FROM \"DBSDBA\".\"HIVE_1114\"", sql);
    }

    @Test
    void paginatedTableSelectSql_oracleUsesOrderByOffsetFetch() {
        ConnectionEntity entity = entity("oracle");
        String base = reader.buildTableSelectSql(entity, "HIVE_1114", "DBSDBA");
        String paginated = FallbackSqlPaginationService.INSTANCE.applyLimitOffset(base, "oracle", 101, 0);
        assertEquals(
                "SELECT * FROM (SELECT * FROM (SELECT * FROM \"DBSDBA\".\"HIVE_1114\" ORDER BY ROWID) WHERE ROWNUM <= 101)",
                paginated
        );
    }

    @Test
    void guessTableName_extractsFromClause() {
        assertEquals("users", reader.guessTableName("select * from users where id = 1"));
        assertNull(reader.guessTableName("select 1"));
    }

    private static ConnectionEntity entity(String dbType) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType(dbType);
        return entity;
    }
}
