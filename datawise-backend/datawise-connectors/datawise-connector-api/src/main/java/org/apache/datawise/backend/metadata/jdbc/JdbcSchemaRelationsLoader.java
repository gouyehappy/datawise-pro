package org.apache.datawise.backend.metadata.jdbc;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.SchemaRelationsResult;
import org.apache.datawise.backend.domain.TableRelationEdge;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.CatalogSchemaScope;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.TableMetadataLoader;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** JDBC schema 级外键关系读取（遍历表 imported keys）。 */
public final class JdbcSchemaRelationsLoader {

    private JdbcSchemaRelationsLoader() {
    }

    public static SchemaRelationsResult load(
                                             Connection connection,
                                             ConnectionEntity entity,
                                             String database,
                                             SchemaDialectRegistry dialectRegistry) throws SQLException {
        String dbType = DbType.normalizeId(entity.getDbType());
        if (DbType.isCatalogSchemaFamily(dbType)) {
            return empty(database);
        }

        CatalogSchemaScope catalogSchema = CatalogSchemaScope.parse(database);
        String catalog = catalogSchema.catalog() != null && !catalogSchema.catalog().isBlank()
                ? catalogSchema.catalog()
                : TableMetadataSupport.resolveCatalog(connection, entity, database);
        SchemaScope scope = catalogSchema.hasSchema()
                ? dialectRegistry.resolve(dbType).resolveScope(connection, catalog, catalogSchema.schema())
                : dialectRegistry.resolve(dbType).resolveScope(connection, catalog);

        DatabaseMetaData meta = connection.getMetaData();
        List<String> tables = listTables(meta, scope);
        Map<String, TableRelationEdge> edgeByKey = new LinkedHashMap<>();

        for (String tableName : tables) {
            List<TableRelationEdge> imported = TableMetadataLoader.loadImportedRelationEdges(meta, scope, tableName);
            for (TableRelationEdge edge : imported) {
                String key = edgeKey(edge);
                edgeByKey.putIfAbsent(key, edge);
            }
        }

        Set<String> tableSet = new LinkedHashSet<>(tables);
        for (TableRelationEdge edge : edgeByKey.values()) {
            if (edge.sourceTable() != null && !edge.sourceTable().isBlank()) {
                tableSet.add(edge.sourceTable());
            }
            if (edge.targetTable() != null && !edge.targetTable().isBlank()) {
                tableSet.add(edge.targetTable());
            }
        }

        List<String> sortedTables = new ArrayList<>(tableSet);
        sortedTables.sort(Comparator.naturalOrder());
        List<TableRelationEdge> edges = edgeByKey.values().stream()
                .sorted(Comparator.comparing(edge -> edgeKey(edge).toLowerCase(Locale.ROOT)))
                .toList();
        return new SchemaRelationsResult(database, sortedTables, edges);
    }

    private static List<String> listTables(DatabaseMetaData meta, SchemaScope scope) throws SQLException {
        List<String> tables = new ArrayList<>();
        try (ResultSet rs = meta.getTables(scope.catalogPattern(), scope.schemaPattern(), "%", new String[]{"TABLE"})) {
            while (rs.next()) {
                String tableName = rs.getString("TABLE_NAME");
                if (tableName != null && !tableName.isBlank()) {
                    tables.add(tableName);
                }
            }
        }
        tables.sort(Comparator.naturalOrder());
        return tables;
    }

    private static String edgeKey(TableRelationEdge edge) {
        return String.join(
                "|",
                safe(edge.constraintName()),
                safe(edge.sourceTable()),
                safe(edge.targetTable()),
                safe(edge.sourceColumns()),
                safe(edge.targetColumns()));
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static SchemaRelationsResult empty(String database) {
        return new SchemaRelationsResult(database, List.of(), List.of());
    }
}
