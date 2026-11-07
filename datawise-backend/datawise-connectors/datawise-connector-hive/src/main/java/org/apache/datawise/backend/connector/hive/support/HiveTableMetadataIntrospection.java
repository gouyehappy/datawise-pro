package org.apache.datawise.backend.connector.hive.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/** Hive table metadata: columns via JDBC/DESCRIBE; DDL via SHOW CREATE TABLE. */
public class HiveTableMetadataIntrospection implements TableMetadataIntrospection {

    @Override
    public boolean supports(String dbType) {
        return DbType.HIVE.id().equals(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return 13;
    }

    @Override
    public TablePropertiesResult loadProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        String comment = loadTableComment(connection, database, tableName);
        List<TableColumnDetail> columns = HiveMetadataSupport.loadColumns(connection, database, tableName);
        return new TablePropertiesResult(
                tableName,
                comment,
                null,
                null,
                null,
                null,
                columns,
                List.of(),
                List.of()
        );
    }

    @Override
    public TableDdlResult loadDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        return new TableDdlResult(HiveMetadataSupport.loadDdl(connection, database, tableName));
    }

    @Override
    public TablePropertiesResult loadViewProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        String comment = loadRelationComment(connection, database, viewName, HiveMetadataSupport.jdbcViewTypes());
        List<TableColumnDetail> columns = HiveMetadataSupport.loadColumns(connection, database, viewName);
        return new TablePropertiesResult(
                viewName,
                comment,
                null,
                null,
                null,
                null,
                columns,
                List.of(),
                List.of()
        );
    }

    @Override
    public TableDdlResult loadViewDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        return new TableDdlResult(HiveMetadataSupport.loadDdl(connection, database, viewName));
    }

    private String loadTableComment(Connection connection, String database, String tableName) throws SQLException {
        return loadRelationComment(connection, database, tableName, HiveMetadataSupport.jdbcTableTypes());
    }

    private String loadRelationComment(
            Connection connection,
            String database,
            String relationName,
            String[] jdbcTypes
    ) throws SQLException {
        HiveMetadataSupport.HiveTableScope scope = HiveMetadataSupport.resolveTableScope(connection, database);
        DatabaseMetaData meta = connection.getMetaData();
        for (String[] probe : HiveMetadataSupport.metadataProbes(scope)) {
            try (ResultSet rs = meta.getTables(
                    probe[0],
                    probe[1],
                    relationName,
                    jdbcTypes
            )) {
                if (rs.next()) {
                    return TableMetadataSupport.blankToNull(rs.getString("REMARKS"));
                }
            }
        }
        return null;
    }
}
