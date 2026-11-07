package org.apache.datawise.backend.connector.elasticsearch.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

/** Elasticsearch index field metadata via SQL DESCRIBE / JDBC metadata. */
public class ElasticsearchTableIntrospector implements TableMetadataIntrospection {

    @Override
    public boolean supports(String dbType) {
        return DbType.ELASTICSEARCH.matches(dbType);
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
        throw new UnsupportedOperationException("Elasticsearch index DDL is not available via JDBC");
    }

    @Override
    public TableDdlResult loadViewDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        throw new UnsupportedOperationException("Elasticsearch view DDL is not available via JDBC");
    }

    private TablePropertiesResult loadRelationProperties(Connection connection, String indexName)
            throws SQLException {
        List<TableColumnDetail> columns = ElasticsearchMetadataSupport.loadColumns(connection, indexName);
        return new TablePropertiesResult(
                indexName,
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
