package org.apache.datawise.backend.connector.kylin.support;

import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

/** Kylin table/cube column metadata via JDBC DatabaseMetaData. */
public class KylinTableIntrospector implements TableMetadataIntrospection {

    @Override
    public boolean supports(String dbType) {
        return org.apache.datawise.backend.common.DbType.KYLIN.matches(dbType);
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
        return loadRelationProperties(connection, tableName);
    }

    @Override
    public TablePropertiesResult loadViewProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        return loadRelationProperties(connection, viewName);
    }

    @Override
    public TableDdlResult loadDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        throw new UnsupportedOperationException("Kylin cube DDL is not available via JDBC");
    }

    @Override
    public TableDdlResult loadViewDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        throw new UnsupportedOperationException("Kylin view DDL is not available via JDBC");
    }

    private TablePropertiesResult loadRelationProperties(Connection connection, String tableName) throws SQLException {
        List<TableColumnDetail> columns = KylinMetadataSupport.loadColumns(connection, tableName);
        return new TablePropertiesResult(
                tableName,
                null,
                null,
                null,
                null,
                null,
                columns,
                List.of(),
                List.of()
        );
    }
}
