package org.apache.datawise.backend.database.drift;

import org.apache.datawise.backend.domain.TableColumnDetail;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNull;

class SchemaDriftSyncSqlTest {

    @Test
    void buildsAddAndDestructiveDrop() {
        List<TableColumnDetail> source = List.of(
                new TableColumnDetail(1, "id", "INT", false, true, "PRI", null, null, null),
                new TableColumnDetail(2, "name", "VARCHAR(64)", false, false, null, null, null, null)
        );
        String sql = SchemaDriftSyncSql.buildColumnSyncSql(
                "mysql",
                "shop",
                "users",
                source,
                List.of("name"),
                List.of("legacy_flag")
        );
        assertTrue(sql.contains("ALTER TABLE `shop`.`users` ADD COLUMN `name` VARCHAR(64) NOT NULL;"));
        assertTrue(sql.contains("-- destructive"));
        assertTrue(sql.contains("DROP COLUMN `legacy_flag`;"));
    }

    @Test
    void returnsNullWhenNoDiff() {
        assertNull(SchemaDriftSyncSql.buildColumnSyncSql(
                "mysql",
                "shop",
                "users",
                List.of(),
                List.of(),
                List.of()
        ));
    }

    @Test
    void wrapCreateTableAppendsSemicolon() {
        assertTrue(SchemaDriftSyncSql.wrapCreateTableDdl("CREATE TABLE t (id INT)").endsWith(";\n"));
    }

    @Test
    void buildsMysqlModifyForTypeMismatch() {
        List<TableColumnDetail> source = List.of(
                new TableColumnDetail(1, "name", "VARCHAR(64)", false, false, null, null, null, null)
        );
        String sql = SchemaDriftSyncSql.buildColumnSyncSql(
                "mysql",
                "shop",
                "users",
                source,
                List.of(),
                List.of(),
                List.of("name: VARCHAR(32) NULL -> VARCHAR(64) NOT NULL")
        );
        assertTrue(sql.contains("-- review"));
        assertTrue(sql.contains("MODIFY COLUMN `name` VARCHAR(64) NOT NULL;"));
    }

    @Test
    void buildsPostgresAlterTypeForTypeMismatch() {
        List<TableColumnDetail> source = List.of(
                new TableColumnDetail(1, "name", "varchar(64)", false, false, null, null, null, null)
        );
        String sql = SchemaDriftSyncSql.buildColumnSyncSql(
                "postgresql",
                "shop",
                "users",
                source,
                List.of(),
                List.of(),
                List.of("name: varchar(32) NULL -> varchar(64) NOT NULL")
        );
        assertTrue(sql.contains("ALTER COLUMN \"name\" TYPE varchar(64);"));
        assertTrue(sql.contains("SET NOT NULL;"));
    }

    @Test
    void buildsMysqlModifyWithCommentForAttributeMismatch() {
        List<TableColumnDetail> source = List.of(
                new TableColumnDetail(1, "name", "VARCHAR(64)", true, false, null, "'x'", null, "display")
        );
        String sql = SchemaDriftSyncSql.buildColumnSyncSql(
                "mysql",
                "shop",
                "users",
                source,
                List.of(),
                List.of(),
                List.of(),
                List.of("name: comment 'display' -> 'label'; default ''x'' -> ''y''")
        );
        assertTrue(sql.contains("MODIFY COLUMN `name` VARCHAR(64) DEFAULT 'x' COMMENT 'display';"));
    }

    @Test
    void buildsPostgresCommentAndDefaultForAttributeMismatch() {
        List<TableColumnDetail> source = List.of(
                new TableColumnDetail(1, "name", "varchar(64)", true, false, null, "'x'", null, "display")
        );
        String sql = SchemaDriftSyncSql.buildColumnSyncSql(
                "postgresql",
                "shop",
                "users",
                source,
                List.of(),
                List.of(),
                List.of(),
                List.of("name: comment 'display' -> 'label'")
        );
        assertTrue(sql.contains("COMMENT ON COLUMN \"shop\".\"users\".\"name\" IS 'display';"));
        assertTrue(sql.contains("SET DEFAULT 'x';"));
    }
}
