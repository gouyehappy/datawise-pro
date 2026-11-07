package org.apache.datawise.backend.metadata.jdbc;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TableRelationEdge;
import org.apache.datawise.backend.domain.TableRelationsResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.CatalogSchemaScope;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.TableMetadataLoader;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;
import java.util.List;

/** JDBC 外键关系读取（imported / exported keys）。 */
public final class JdbcTableRelationsLoader {

    private JdbcTableRelationsLoader() {
    }

    public static TableRelationsResult load(
                                            Connection connection,
                                            ConnectionEntity entity,
                                            String database,
                                            String tableName,
                                            SchemaDialectRegistry dialectRegistry) throws SQLException {
        String dbType = DbType.normalizeId(entity.getDbType());
        if (DbType.isCatalogSchemaFamily(dbType)) {
            return empty(tableName);
        }

        CatalogSchemaScope catalogSchema = CatalogSchemaScope.parse(database);
        String catalog = catalogSchema.catalog() != null && !catalogSchema.catalog().isBlank()
                ? catalogSchema.catalog()
                : TableMetadataSupport.resolveCatalog(connection, entity, database);
        SchemaScope scope = catalogSchema.hasSchema()
                ? dialectRegistry.resolve(dbType).resolveScope(connection, catalog, catalogSchema.schema())
                : dialectRegistry.resolve(dbType).resolveScope(connection, catalog);

        DatabaseMetaData meta = connection.getMetaData();
        List<TableRelationEdge> references = TableMetadataLoader.loadImportedRelationEdges(meta, scope, tableName);
        List<TableRelationEdge> referencedBy = TableMetadataLoader.loadExportedRelationEdges(meta, scope, tableName);
        return new TableRelationsResult(tableName, references, referencedBy);
    }

    private static TableRelationsResult empty(String tableName) {
        return new TableRelationsResult(tableName, List.of(), List.of());
    }
}
