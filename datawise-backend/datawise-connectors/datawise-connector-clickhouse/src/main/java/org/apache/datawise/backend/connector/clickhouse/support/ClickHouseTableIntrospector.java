package org.apache.datawise.backend.connector.clickhouse.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TableForeignKeyDetail;
import org.apache.datawise.backend.domain.TableIndexDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/** ClickHouse table/view metadata via system.tables / system.columns and SHOW CREATE TABLE. */
public class ClickHouseTableIntrospector implements TableMetadataIntrospection {

    @Override
    public boolean supports(String dbType) {
        return DbType.CLICKHOUSE.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public TablePropertiesResult loadProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        return loadRelationProperties(connection, database, tableName);
    }

    @Override
    public TablePropertiesResult loadViewProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        return loadRelationProperties(connection, database, viewName);
    }

    @Override
    public TableDdlResult loadDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        return new TableDdlResult(showCreate(connection, database, tableName));
    }

    @Override
    public TableDdlResult loadViewDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        return new TableDdlResult(showCreate(connection, database, viewName));
    }

    private TablePropertiesResult loadRelationProperties(
            Connection connection,
            String database,
            String relationName
    ) throws SQLException {
        String db = requireDatabase(database);
        String name = relationName == null ? "" : relationName.trim();
        String comment = loadTableComment(connection, db, name);
        List<TableColumnDetail> columns = loadColumns(connection, db, name);
        return new TablePropertiesResult(
                relationName,
                comment,
                null,
                null,
                null,
                null,
                columns,
                List.<TableForeignKeyDetail>of(),
                List.<TableIndexDetail>of()
        );
    }

    private String loadTableComment(Connection connection, String database, String tableName) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT comment
                FROM system.tables
                WHERE database = ? AND name = ?
                """)) {
            ps.setString(1, database);
            ps.setString(2, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return TableMetadataSupport.blankToNull(rs.getString("comment"));
                }
            }
        }
        return null;
    }

    private List<TableColumnDetail> loadColumns(Connection connection, String database, String tableName)
            throws SQLException {
        List<TableColumnDetail> columns = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT position,
                       name,
                       type,
                       comment,
                       default_expression,
                       is_in_primary_key,
                       is_nullable
                FROM system.columns
                WHERE database = ? AND table = ?
                ORDER BY position
                """)) {
            ps.setString(1, database);
            ps.setString(2, tableName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    columns.add(new TableColumnDetail(
                            rs.getInt("position"),
                            rs.getString("name"),
                            rs.getString("type"),
                            rs.getInt("is_nullable") == 1,
                            false,
                            null,
                            TableMetadataSupport.blankToNull(rs.getString("default_expression")),
                            null,
                            TableMetadataSupport.blankToNull(rs.getString("comment"))
                    ));
                }
            }
        }
        return columns;
    }

    private String showCreate(Connection connection, String database, String relationName) throws SQLException {
        String qualified = DbType.quoteQualifiedTable(DbType.CLICKHOUSE.id(), database, relationName);
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SHOW CREATE TABLE " + qualified)) {
            if (!rs.next()) {
                throw new IllegalArgumentException("Relation not found: " + qualified);
            }
            String ddl = rs.getString(1);
            if (ddl == null || ddl.isBlank()) {
                ddl = rs.getString("statement");
            }
            if (ddl == null || ddl.isBlank()) {
                throw new IllegalArgumentException("DDL is not available for: " + qualified);
            }
            return ddl.trim();
        }
    }

    private static String requireDatabase(String database) {
        if (database == null || database.isBlank()) {
            throw new IllegalArgumentException("ClickHouse database is required");
        }
        return database.trim();
    }
}
